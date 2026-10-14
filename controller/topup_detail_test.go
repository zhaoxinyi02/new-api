package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const detailTestTradeNo = "OFF9NO1791897638XJL55d"

// setupTopUpDetailTest wires an in-memory database holding one order owned by a
// regular user, plus a second user and an administrator to exercise access
// control on the order detail endpoint.
func setupTopUpDetailTest(t *testing.T) (ownerId int, strangerId int) {
	t.Helper()
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.TopUp{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
	))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	owner := &model.User{Username: "receipt-owner", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "receipt-owner"}
	stranger := &model.User{Username: "receipt-stranger", Password: "placeholder", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "receipt-stranger"}
	require.NoError(t, db.Create(owner).Error)
	require.NoError(t, db.Create(stranger).Error)

	order := &model.TopUp{
		TradeNo:         detailTestTradeNo,
		UserId:          owner.Id,
		Amount:          73,
		Money:           73,
		PaymentMethod:   model.PaymentMethodOfflineQR,
		PaymentProvider: model.PaymentProviderOffline,
		Status:          common.TopUpStatusSuccess,
		CreateTime:      1791897638,
		CompleteTime:    1791897700,
		Note:            "微信流水 12345",
	}
	require.NoError(t, db.Create(order).Error)
	return owner.Id, stranger.Id
}

func topUpDetailRouter(userId int, role int) *gin.Engine {
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("id", userId)
		c.Set("role", role)
		c.Next()
	})
	router.GET("/api/user/topup/:trade_no", GetTopUpDetail)
	return router
}

func getTopUpDetail(t *testing.T, router *gin.Engine, tradeNo string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/user/topup/"+tradeNo, nil))
	return recorder
}

// An offline payment applied to a plan keeps its trade number and additionally
// owns a subscription order, which is how the receipt knows to show the plan
// instead of a wallet credit.
func TestGetTopUpDetailReturnsPlanPurchase(t *testing.T) {
	ownerId, _ := setupTopUpDetailTest(t)
	t.Setenv(offlinePayInfoEnv, `{"holder":"湖北省澜算科技有限责任公司","account":"17260401040013448"}`)

	plan := &model.SubscriptionPlan{
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
	require.NoError(t, model.DB.Create(plan).Error)
	model.InvalidateSubscriptionPlanCache(plan.Id)

	require.NoError(t, model.DB.Create(&model.SubscriptionOrder{
		UserId:          ownerId,
		PlanId:          plan.Id,
		Money:           1000,
		TradeNo:         detailTestTradeNo,
		PaymentMethod:   model.PaymentMethodOfflineQR,
		PaymentProvider: model.PaymentProviderOffline,
		Status:          common.TopUpStatusSuccess,
		CreateTime:      1791897638,
		CompleteTime:    1791897700,
	}).Error)
	require.NoError(t, model.DB.Create(&model.UserSubscription{
		UserId:      ownerId,
		PlanId:      plan.Id,
		AmountTotal: plan.TotalAmount,
		StartTime:   1791897700,
		EndTime:     1794586500,
		Status:      "active",
		Source:      "order",
	}).Error)

	recorder := getTopUpDetail(t, topUpDetailRouter(ownerId, common.RoleCommonUser), detailTestTradeNo)
	require.Equal(t, http.StatusOK, recorder.Code)

	body := map[string]any{}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	data := body["data"].(map[string]any)

	planPayload, ok := data["plan"].(map[string]any)
	require.True(t, ok, "plan payload missing")
	assert.Equal(t, "标准包月套餐", planPayload["title"])
	assert.Equal(t, float64(500000000), planPayload["total_amount"])
	assert.Equal(t, model.SubscriptionResetNever, planPayload["quota_reset_period"])

	subscription, ok := data["subscription"].(map[string]any)
	require.True(t, ok, "subscription payload missing")
	assert.Equal(t, "active", subscription["status"])
	assert.Equal(t, float64(plan.TotalAmount), subscription["amount_total"])
	assert.Equal(t, float64(1794586500), subscription["end_time"])
}

func TestGetTopUpDetailReturnsReceiptFields(t *testing.T) {
	ownerId, _ := setupTopUpDetailTest(t)
	t.Setenv(offlinePayInfoEnv, `{"holder":"湖北省澜算科技有限责任公司","account":"17260401040013448"}`)

	recorder := getTopUpDetail(t, topUpDetailRouter(ownerId, common.RoleCommonUser), detailTestTradeNo)
	require.Equal(t, http.StatusOK, recorder.Code)

	body := map[string]any{}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, true, body["success"])
	data := body["data"].(map[string]any)
	// The payer is resolved server-side so the receipt can name the account that
	// paid, and the seller comes from the收款信息 the operator configured.
	assert.Equal(t, "receipt-owner", data["payer"])
	assert.Equal(t, "湖北省澜算科技有限责任公司", data["seller"])

	order := data["order"].(map[string]any)
	assert.Equal(t, detailTestTradeNo, order["trade_no"])
	assert.Equal(t, "success", order["status"])
	assert.Equal(t, float64(73), order["money"])
	assert.Equal(t, float64(73), order["amount"])
	assert.Equal(t, model.PaymentMethodOfflineQR, order["payment_method"])
	assert.Equal(t, model.PaymentProviderOffline, order["payment_provider"])
	assert.Equal(t, "微信流水 12345", order["note"])
	assert.NotZero(t, order["create_time"])
	assert.NotZero(t, order["complete_time"])
	// A plain wallet top-up carries no plan purchase.
	assert.Nil(t, data["plan"])
	assert.Nil(t, data["subscription"])
}

func TestGetTopUpDetailAccessControl(t *testing.T) {
	ownerId, strangerId := setupTopUpDetailTest(t)

	testCases := []struct {
		name       string
		userId     int
		role       int
		tradeNo    string
		wantStatus int
	}{
		{name: "owner reads own order", userId: ownerId, role: common.RoleCommonUser, tradeNo: detailTestTradeNo, wantStatus: http.StatusOK},
		{name: "administrator reads any order", userId: strangerId, role: common.RoleAdminUser, tradeNo: detailTestTradeNo, wantStatus: http.StatusOK},
		{name: "another user is refused", userId: strangerId, role: common.RoleCommonUser, tradeNo: detailTestTradeNo, wantStatus: http.StatusForbidden},
		{name: "unknown order", userId: ownerId, role: common.RoleCommonUser, tradeNo: "OFF9NOnope", wantStatus: http.StatusNotFound},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := getTopUpDetail(t, topUpDetailRouter(tc.userId, tc.role), tc.tradeNo)
			assert.Equal(t, tc.wantStatus, recorder.Code)
			if tc.wantStatus != http.StatusOK {
				assert.NotContains(t, recorder.Body.String(), "receipt-owner")
			}
		})
	}
}
