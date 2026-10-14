package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createOfflineTestTopUp(t *testing.T, tradeNo string, userId int, status string) *TopUp {
	t.Helper()
	topUp := &TopUp{
		UserId:          userId,
		Amount:          10,
		Money:           73,
		TradeNo:         tradeNo,
		PaymentMethod:   PaymentMethodOffline,
		PaymentProvider: PaymentProviderOffline,
		CreateTime:      common.GetTimestamp(),
		Status:          status,
	}
	require.NoError(t, topUp.Insert())
	return topUp
}

func TestManualRejectTopUpMarksPendingOrderFailedWithoutCredit(t *testing.T) {
	user := &User{Username: "topup-reject-user", Password: "password", Status: common.UserStatusEnabled, Quota: 100}
	require.NoError(t, DB.Create(user).Error)
	topUp := createOfflineTestTopUp(t, "OFF-test-reject-pending", user.Id, common.TopUpStatusPending)

	require.NoError(t, ManualRejectTopUp(topUp.TradeNo, "1.2.3.4"))

	rejected := GetTopUpByTradeNo(topUp.TradeNo)
	require.NotNil(t, rejected)
	assert.Equal(t, common.TopUpStatusFailed, rejected.Status)
	assert.NotZero(t, rejected.CompleteTime)

	var quota int
	require.NoError(t, DB.Model(&User{}).Select("quota").Where("id = ?", user.Id).Scan(&quota).Error)
	assert.Equal(t, 100, quota, "rejecting must not credit the wallet")
}

func TestManualRejectTopUpRejectsNonPendingOrders(t *testing.T) {
	completed := createOfflineTestTopUp(t, "OFF-test-reject-done", 1, common.TopUpStatusSuccess)
	assert.Error(t, ManualRejectTopUp(completed.TradeNo, "1.2.3.4"))

	failed := createOfflineTestTopUp(t, "OFF-test-reject-failed", 1, common.TopUpStatusFailed)
	assert.Error(t, ManualRejectTopUp(failed.TradeNo, "1.2.3.4"))

	assert.Error(t, ManualRejectTopUp("OFF-test-reject-missing", "1.2.3.4"))
}

func TestUpdateTopUpNoteGuardsOwnershipAndPendingState(t *testing.T) {
	topUp := createOfflineTestTopUp(t, "OFF-test-note-pending", 8, common.TopUpStatusPending)

	require.NoError(t, UpdateTopUpNote(topUp.TradeNo, 8, "  微信流水 12345  "))
	updated := GetTopUpByTradeNo(topUp.TradeNo)
	require.NotNil(t, updated)
	assert.Equal(t, "微信流水 12345", updated.Note)

	// Other users cannot read-modify someone else's order, and empty notes are rejected.
	assert.Error(t, UpdateTopUpNote(topUp.TradeNo, 9, "other"))
	assert.Error(t, UpdateTopUpNote(topUp.TradeNo, 8, "   "))

	failed := createOfflineTestTopUp(t, "OFF-test-note-failed", 8, common.TopUpStatusFailed)
	assert.Error(t, UpdateTopUpNote(failed.TradeNo, 8, "late note"))
}

func TestGetAllTopUpsFiltersByStatus(t *testing.T) {
	pending := createOfflineTestTopUp(t, "OFF-test-filter-pending", 1, common.TopUpStatusPending)
	createOfflineTestTopUp(t, "OFF-test-filter-success", 1, common.TopUpStatusSuccess)

	pageInfo := &common.PageInfo{Page: 1, PageSize: 50}
	topups, total, err := GetAllTopUps(pageInfo, common.TopUpStatusPending)
	require.NoError(t, err)
	require.NotEmpty(t, topups)
	for _, item := range topups {
		assert.Equal(t, common.TopUpStatusPending, item.Status)
	}
	assert.Contains(t, tradeNos(topups), pending.TradeNo)

	topups, total, err = GetAllTopUps(pageInfo, "")
	require.NoError(t, err)
	assert.GreaterOrEqual(t, total, int64(2))
	assert.Contains(t, tradeNos(topups), pending.TradeNo)
}

func tradeNos(topups []*TopUp) []string {
	result := make([]string, 0, len(topups))
	for _, topUp := range topups {
		result = append(result, topUp.TradeNo)
	}
	return result
}
