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
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	armorsetting "github.com/QuantumNous/new-api/setting/armor_setting"
	"github.com/gin-gonic/gin"
)

// ArmorLinePrefix 破甲专用线路的路径前缀。
const ArmorLinePrefix = "/v2"

// ArmorLine 破甲专用线路（/v2）的入口中间件，做两件事：
//
//  1. 在 gin.Context 里打上破甲线标记，注入收口只认这一个标记；
//  2. 把路径归一化成 /v1 语义再往下走 —— 计费、用量日志、RelayMode 判定、
//     渠道选择、上游 URL 拼装全都只看 /v1 前缀，归一化之后专用线路与普通线路
//     除了「注入 / 不注入破甲提示词」以外完全同构。
//
// 归一化发生在路由匹配之后，所以 gin 的 :param / *path 取值不受影响；
// 客户端看到的响应里也没有任何线路痕迹（无响应头、无用量日志字段）。
// 只有服务端日志会记一行原始路径，方便站主自己对账。
func ArmorLine() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request != nil && c.Request.URL != nil {
			if suffix, ok := strings.CutPrefix(c.Request.URL.Path, ArmorLinePrefix); ok {
				normalized := "/v1" + suffix
				c.Set(armorsetting.ContextKey, true)
				c.Request.URL.Path = normalized
				if c.Request.URL.RawPath != "" {
					c.Request.URL.RawPath = normalized
				}
				logger.LogInfo(c, common.LogText("armor line request: %s -> %s", ArmorLinePrefix+suffix, normalized))
			}
		}
		c.Next()
	}
}
