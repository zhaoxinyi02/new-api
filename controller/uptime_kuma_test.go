package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The status page API lists a monitor's heartbeats oldest-first, so the panel
// has to read the last entry; taking the first would report the oldest state.
func TestFetchGroupDataUsesLatestHeartbeatAndUptime(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload any
		if r.URL.Path == "/api/status-page/lansuan" {
			payload = map[string]any{
				"publicGroupList": []any{
					map[string]any{
						"id":   1,
						"name": "主站",
						"monitorList": []any{
							map[string]any{"id": 11, "name": "api.lansuan.cc"},
							map[string]any{"id": 12, "name": "quiet.lansuan.cc"},
						},
					},
					map[string]any{"id": 2, "name": "空分组", "monitorList": []any{}},
				},
			}
		} else {
			payload = map[string]any{
				"heartbeatList": map[string]any{
					"11": []any{
						map[string]any{"status": 0},
						map[string]any{"status": 1},
					},
					"12": []any{},
				},
				"uptimeList": map[string]any{"11_24": 0.987, "12_24": 1.0},
			}
		}
		encoded, err := common.Marshal(payload)
		require.NoError(t, err)
		_, _ = w.Write(encoded)
	}))
	defer upstream.Close()

	result := fetchGroupData(context.Background(), upstream.Client(), map[string]any{
		"url":          upstream.URL,
		"slug":         "lansuan",
		"categoryName": "澜算服务状态",
	})

	assert.Equal(t, "澜算服务状态", result.CategoryName)
	require.Len(t, result.Monitors, 2, "an empty group must contribute no monitors")
	assert.Equal(t, Monitor{Name: "api.lansuan.cc", Group: "主站", Status: 1, Uptime: 0.987}, result.Monitors[0])
	// A monitor without heartbeats keeps the pending/unknown default of 0.
	assert.Equal(t, Monitor{Name: "quiet.lansuan.cc", Group: "主站", Status: 0, Uptime: 1}, result.Monitors[1])
}

func TestFetchGroupDataWithoutConfigurationReturnsEmptyGroup(t *testing.T) {
	result := fetchGroupData(context.Background(), http.DefaultClient, map[string]any{"categoryName": "未配置"})
	assert.Equal(t, "未配置", result.CategoryName)
	assert.Empty(t, result.Monitors)
}
