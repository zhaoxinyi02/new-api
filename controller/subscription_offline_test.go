package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// An offline plan purchase is mirrored into the top-up table so the existing
// administrator review queue can settle it. These tests pin the two things that
// mirror must guarantee: approving activates the subscription without crediting
// any wallet balance, and rejecting activates nothing.
const offlinePlanTradeNo = "SUB1NO1791975000abc123"

func setupOfflineSubscriptionTest(t *testing.T) (userId int, plan *model.SubscriptionPlan) {
	t.Helper()
	previousDB := model.DB
	// A shared-cache in-memory database: the approval path opens its own
	// transaction, so several pooled connections must see the same tables.
	dsn := "file:" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.TopUp{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
		&model.Log{},
	))
	previousLogDB := model.LOG_DB
	model.DB = db
	model.LOG_DB = db
	// The approval path records a log line, which reads the user through the
	// shared cache; keep Redis out of the picture so the fixture is self-contained.
	previousRedis := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.RedisEnabled = previousRedis
	})

	user := &model.User{
		Username: "plan-buyer",
		Password: "placeholder",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Group:    "default",
		AffCode:  "plan-buyer",
	}
	require.NoError(t, db.Create(user).Error)

	plan = &model.SubscriptionPlan{
		Title:            "标准包月套餐",
		PriceAmount:      1000,
		Currency:         "CNY",
		DurationUnit:     model.SubscriptionDurationMonth,
		DurationValue:    1,
		Enabled:          true,
		TotalAmount:      500000000,
		QuotaResetPeriod: model.SubscriptionResetNever,
	}
	plan.NormalizeDefaults()
	require.NoError(t, db.Create(plan).Error)
	model.InvalidateSubscriptionPlanCache(plan.Id)
	return user.Id, plan
}

// adminTopUpRouter exposes the two administrator review endpoints the billing
// history uses, with the acting role injected through the request context.
func adminTopUpRouter(role int) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", 1)
		c.Set("role", role)
		c.Next()
	})
	router.POST("/api/user/topup/complete", AdminCompleteTopUp)
	router.POST("/api/user/topup/reject", AdminRejectTopUp)
	return router
}

func postAdminTopUp(t *testing.T, router *gin.Engine, path string, tradeNo string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	body := strings.NewReader(`{"trade_no":"` + tradeNo + `"}`)
	request := httptest.NewRequest(http.MethodPost, path, body)
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestPendingOfflineSubscriptionOrderMirrorsTopUpWithoutBalance(t *testing.T) {
	userId, plan := setupOfflineSubscriptionTest(t)

	order, err := model.CreatePendingOfflineSubscriptionOrder(userId, plan, model.PaymentMethodOfflineQR)
	require.NoError(t, err)
	require.NotEmpty(t, order.TradeNo)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
	assert.Equal(t, model.PaymentProviderOffline, order.PaymentProvider)
	assert.Equal(t, float64(1000), order.Money)

	var mirror model.TopUp
	require.NoError(t, model.DB.Where("trade_no = ?", order.TradeNo).First(&mirror).Error)
	// The mirror row must not claim a wallet credit: it is only the review entry.
	assert.Zero(t, mirror.Amount)
	assert.Equal(t, float64(1000), mirror.Money)
	assert.Equal(t, common.TopUpStatusPending, mirror.Status)
	assert.Equal(t, model.PaymentMethodOfflineQR, mirror.PaymentMethod)
	assert.Contains(t, mirror.Note, plan.Title)

	// No subscription exists before an administrator approves the order.
	var subscriptionsBefore int64
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("user_id = ?", userId).Count(&subscriptionsBefore).Error)
	assert.Zero(t, subscriptionsBefore)
}

func TestDisabledPlanCannotStartOfflinePurchase(t *testing.T) {
	userId, plan := setupOfflineSubscriptionTest(t)
	require.NoError(t, model.DB.Model(plan).Update("enabled", false).Error)
	model.InvalidateSubscriptionPlanCache(plan.Id)

	_, err := model.CreatePendingOfflineSubscriptionOrder(userId, plan, model.PaymentMethodOfflineQR)
	assert.Error(t, err)
}

func TestAdminCompleteOfflineSubscriptionOrderActivatesPlanWithoutCredit(t *testing.T) {
	userId, plan := setupOfflineSubscriptionTest(t)
	order, err := model.CreatePendingOfflineSubscriptionOrder(userId, plan, model.PaymentMethodOffline)
	require.NoError(t, err)

	recorder := postAdminTopUp(t, adminTopUpRouter(common.RoleAdminUser), "/api/user/topup/complete", order.TradeNo)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)

	var subscription model.UserSubscription
	require.NoError(t, model.DB.Where("user_id = ?", userId).First(&subscription).Error)
	assert.Equal(t, plan.Id, subscription.PlanId)
	assert.Equal(t, "active", subscription.Status)
	assert.Equal(t, "order", subscription.Source)
	assert.Equal(t, plan.TotalAmount, subscription.AmountTotal)
	assert.Greater(t, subscription.EndTime, subscription.StartTime)

	// Wallet balance stays untouched: the money bought a plan, not credit.
	var user model.User
	require.NoError(t, model.DB.First(&user, userId).Error)
	assert.Zero(t, user.Quota)

	var completed model.SubscriptionOrder
	require.NoError(t, model.DB.Where("trade_no = ?", order.TradeNo).First(&completed).Error)
	assert.Equal(t, common.TopUpStatusSuccess, completed.Status)

	var mirror model.TopUp
	require.NoError(t, model.DB.Where("trade_no = ?", order.TradeNo).First(&mirror).Error)
	assert.Equal(t, common.TopUpStatusSuccess, mirror.Status)
	assert.Zero(t, mirror.Amount)

	// Approving twice stays idempotent and still creates only one subscription.
	again := postAdminTopUp(t, adminTopUpRouter(common.RoleAdminUser), "/api/user/topup/complete", order.TradeNo)
	require.Equal(t, http.StatusOK, again.Code)
	var subscriptionsAfter int64
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("user_id = ?", userId).Count(&subscriptionsAfter).Error)
	assert.Equal(t, int64(1), subscriptionsAfter)
}

func TestAdminRejectOfflineSubscriptionOrderActivatesNothing(t *testing.T) {
	userId, plan := setupOfflineSubscriptionTest(t)
	order, err := model.CreatePendingOfflineSubscriptionOrder(userId, plan, model.PaymentMethodOfflineQR)
	require.NoError(t, err)

	recorder := postAdminTopUp(t, adminTopUpRouter(common.RoleAdminUser), "/api/user/topup/reject", order.TradeNo)
	require.Equal(t, http.StatusOK, recorder.Code)

	var subscriptionsAfterReject int64
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("user_id = ?", userId).Count(&subscriptionsAfterReject).Error)
	assert.Zero(t, subscriptionsAfterReject)

	var rejected model.SubscriptionOrder
	require.NoError(t, model.DB.Where("trade_no = ?", order.TradeNo).First(&rejected).Error)
	assert.Equal(t, common.TopUpStatusExpired, rejected.Status)

	var mirror model.TopUp
	require.NoError(t, model.DB.Where("trade_no = ?", order.TradeNo).First(&mirror).Error)
	assert.Equal(t, common.TopUpStatusFailed, mirror.Status)
}
