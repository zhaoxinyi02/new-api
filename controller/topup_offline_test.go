package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeOfflinePayMethod(t *testing.T) {
	testCases := []struct {
		name    string
		raw     string
		want    string
		wantErr bool
	}{
		{name: "omitted defaults to bank transfer", raw: "", want: model.PaymentMethodOffline},
		{name: "bank transfer", raw: model.PaymentMethodOffline, want: model.PaymentMethodOffline},
		{name: "qr payment", raw: model.PaymentMethodOfflineQR, want: model.PaymentMethodOfflineQR},
		{name: "surrounding whitespace", raw: " " + model.PaymentMethodOfflineQR + " ", want: model.PaymentMethodOfflineQR},
		{name: "gateway method", raw: model.PaymentMethodStripe, wantErr: true},
		{name: "unknown method", raw: "offline_alipay", wantErr: true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			method, ok := normalizeOfflinePayMethod(tc.raw)
			if tc.wantErr {
				assert.False(t, ok)
				assert.Empty(t, method)
				return
			}
			require.True(t, ok)
			assert.Equal(t, tc.want, method)
		})
	}
}

func TestOfflinePayInfoFollowsPaymentMethod(t *testing.T) {
	t.Setenv(offlinePayInfoEnv, `{"holder":"ACME","account":"17260401040013448"}`)
	t.Setenv(qrPayInfoEnv, `{"holder":"ACME","qr_image":"data:image/png;base64,AAA"}`)

	bank := offlinePayInfo(model.PaymentMethodOffline)
	assert.Equal(t, "17260401040013448", bank["account"])
	assert.NotContains(t, bank, "qr_image")

	qr := offlinePayInfo(model.PaymentMethodOfflineQR)
	assert.Equal(t, "data:image/png;base64,AAA", qr["qr_image"])
	assert.NotContains(t, qr, "account")
}

func TestOfflinePayInfoFallsBackToFreeText(t *testing.T) {
	// A收款信息 value that is not JSON is shown verbatim under "text".
	t.Setenv(qrPayInfoEnv, "扫码付款请联系客服")

	info := offlinePayInfo(model.PaymentMethodOfflineQR)
	assert.Equal(t, map[string]string{"text": "扫码付款请联系客服"}, info)
}

func TestOfflinePayInfoMissingEnvIsEmpty(t *testing.T) {
	t.Setenv(offlinePayInfoEnv, "")
	t.Setenv(qrPayInfoEnv, "")

	assert.Empty(t, offlinePayInfo(model.PaymentMethodOffline))
	assert.Empty(t, offlinePayInfo(model.PaymentMethodOfflineQR))
}
