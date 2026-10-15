/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	armorsetting "github.com/QuantumNous/new-api/setting/armor_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestArmorLineMarksContextAndNormalizesPath 破甲线路中间件要同时做到：
// 打上破甲标记，并把 /v2 归一化成 /v1 语义，让下游计费 / 日志 / 渠道选择与普通请求完全一致。
func TestArmorLineMarksContextAndNormalizesPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(ArmorLine())

	var seenPath, seenRawPath string
	var marked bool
	engine.POST("/v2/chat/completions", func(c *gin.Context) {
		seenPath = c.Request.URL.Path
		seenRawPath = c.Request.URL.RawPath
		marked = c.GetBool(armorsetting.ContextKey)
		c.Status(http.StatusOK)
	})
	engine.POST("/v1/chat/completions", func(c *gin.Context) {
		seenPath = c.Request.URL.Path
		marked = c.GetBool(armorsetting.ContextKey)
		c.Status(http.StatusOK)
	})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v2/chat/completions", nil)
	engine.ServeHTTP(recorder, req)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.True(t, marked, "破甲线路请求必须带上破甲标记")
	assert.Equal(t, "/v1/chat/completions", seenPath, "路径要归一化成 /v1 语义")
	assert.Empty(t, seenRawPath, "RawPath 为空时不应被写成残留值")

	marked = false
	recorder = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	engine.ServeHTTP(recorder, req)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.False(t, marked, "普通线路不能被打上破甲标记")
	assert.Equal(t, "/v1/chat/completions", seenPath)
}

// TestArmorLineNormalizesRawPath 客户端带 RawPath（含转义）时也要一起改写。
func TestArmorLineNormalizesRawPath(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(ArmorLine())

	var seenRawPath string
	engine.POST("/v2/messages", func(c *gin.Context) {
		seenRawPath = c.Request.URL.RawPath
		c.Status(http.StatusOK)
	})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v2/messages", nil)
	req.URL.RawPath = "/v2/messages"
	engine.ServeHTTP(recorder, req)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "/v1/messages", seenRawPath)
}

// TestArmorLineLeavesOtherPathsUntouched 其它前缀（例如 /v1/models）不受影响。
func TestArmorLineLeavesOtherPathsUntouched(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(ArmorLine())

	var seenPath string
	var marked bool
	engine.GET("/v1/models", func(c *gin.Context) {
		seenPath = c.Request.URL.Path
		marked = c.GetBool(armorsetting.ContextKey)
		c.Status(http.StatusOK)
	})

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	engine.ServeHTTP(recorder, req)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "/v1/models", seenPath)
	assert.False(t, marked)
}
