package controller

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// UpstreamQuotaMonitor 上游额度监测（管理员）。
//
// 设计目标：把"每个上游账号还剩多少额度"聚到一个接口里，前端管理员菜单
// 「上游额度」直接展示。各上游的查询方式不同：
//
//   - OpenAI 兼容中转（ccapi.us 等）：/v1/dashboard/billing/subscription + /usage
//   - 智谱 GLM Coding Plan（glm-coding-plan 特殊路由）：/models 存活探测 +
//     套餐内模型数（官方暂无公开的套餐余量接口，拿到接口后在此扩展）
//   - 火山方舟 Agent Plan：余量走控制台签名 RPC，公开 API 查不到，标注说明
//
// 新增上游时在 probeUpstreamQuota 里加分支即可。
type UpstreamQuotaItem struct {
	Id           int            `json:"id"`
	Name         string         `json:"name"`
	Type         int            `json:"type"`
	BaseURL      string         `json:"base_url"`
	Status       int            `json:"status"`
	ResponseTime int            `json:"response_time"`
	TestTime     int64          `json:"test_time"`
	UsedQuota    int64          `json:"used_quota"`
	Balance      float64        `json:"balance"`
	Upstream     map[string]any `json:"upstream"`
	Note         string         `json:"note"`
}

var upstreamQuotaClient = &http.Client{Timeout: 8 * time.Second}

func upstreamQuotaGet(url, key string) (int, []byte, error) {
	return upstreamQuotaGetAuth(url, "Bearer "+key)
}

// upstreamQuotaGetAuth 允许自定义 Authorization 值。
// 智谱国内站（open.bigmodel.cn）的 monitor 接口要裸 key，国际站（api.z.ai）要 Bearer。
func upstreamQuotaGetAuth(url, authorization string) (int, []byte, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", authorization)
	req.Header.Set("User-Agent", "new-api-upstream-quota")
	req.Header.Set("accept", "application/json")
	resp, err := upstreamQuotaClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return resp.StatusCode, body, err
}

// probeUpstreamQuota 返回 (上游额度信息, 备注)。额度信息拿不到时上游字段为 nil。
func probeUpstreamQuota(ch *model.Channel) (map[string]any, string) {
	base := ""
	if ch.BaseURL != nil {
		base = strings.TrimSpace(*ch.BaseURL)
	}
	if base == "" {
		base = constant.GetChannelBaseURL(ch.Type)
	}
	if base == "" {
		return nil, "未配置上游地址"
	}

	// 智谱 GLM Coding Plan 等特殊路由：base_url 存的是计划别名，解析成真实地址
	if special, ok := constant.ChannelSpecialBases[base]; ok {
		if special.OpenAIBaseURL != "" {
			base = special.OpenAIBaseURL
		}
		if strings.Contains(base, "bigmodel.cn") || strings.Contains(base, "api.z.ai") {
			return probeZhipuCodingPlan(base, ch.Key)
		}
	}

	if strings.Contains(base, "ark.cn-beijing.volces.com") || strings.Contains(base, "/api/plan") {
		return nil, "火山 Agent Plan 余量走控制台签名接口，暂无公开查询（本机 arkcli usage plan 可核对）"
	}

	if strings.Contains(base, "ccapi") || strings.Contains(base, "ccapi.us") {
		return probeOpenAIBilling(base, ch.Key)
	}

	// 其他 OpenAI 兼容上游：也试一次通用计费接口，失败静默降级为备注
	if info, note := probeOpenAIBilling(base, ch.Key); info != nil {
		return info, note
	}
	return nil, "该上游暂无已适配的额度查询接口"
}

func probeZhipuCodingPlan(base, key string) (map[string]any, string) {
	// 套餐内模型数（/models 存活探测）
	modelCode, body, err := upstreamQuotaGet(strings.TrimRight(base, "/")+"/models", key)
	modelCount := 0
	modelsOk := false
	if err == nil && modelCode == http.StatusOK {
		var parsed struct {
			Data []struct {
				Id string `json:"id"`
			} `json:"data"`
		}
		if common.Unmarshal(body, &parsed) == nil {
			modelCount = len(parsed.Data)
			modelsOk = true
		}
	}

	// 套餐余量：官方 monitor 接口（社区从控制台抓包确认的稳定端点）。
	// 挂在域名根路径，与 coding base 的 /api/coding/paas/v4 无关。
	// 国内站（open.bigmodel.cn）要求裸 key；国际站（api.z.ai）要求 Bearer 前缀。
	auth := "Bearer " + key
	if strings.Contains(base, "bigmodel.cn") {
		auth = key
	}
	monitorBase := base
	if u, err := url.Parse(base); err == nil && u.Scheme != "" && u.Host != "" {
		monitorBase = u.Scheme + "://" + u.Host
	}
	code, body, err := upstreamQuotaGetAuth(strings.TrimRight(monitorBase, "/")+"/api/monitor/usage/quota/limit", auth)
	if err != nil {
		if modelsOk {
			return map[string]any{"kind": "zhipu_coding_plan", "plan_models": modelCount},
				fmt.Sprintf("key 有效；余量查询失败：%v", err)
		}
		return nil, "探测失败：" + err.Error()
	}
	if code != http.StatusOK {
		if modelsOk {
			return map[string]any{"kind": "zhipu_coding_plan", "plan_models": modelCount},
				fmt.Sprintf("key 有效；余量接口返回 %d", code)
		}
		return nil, fmt.Sprintf("上游返回 %d（key 可能失效）", code)
	}
	var quota struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			Level  string `json:"level"`
			Limits []struct {
				Type          string `json:"type"`
				Unit          int    `json:"unit"`
				Number        int    `json:"number"`
				Usage         int64  `json:"usage"`
				Remaining     int64  `json:"remaining"`
				Percentage    int    `json:"percentage"`
				NextResetTime int64  `json:"nextResetTime"`
			} `json:"limits"`
		} `json:"data"`
	}
	if common.Unmarshal(body, &quota) != nil || !strings.HasPrefix(strings.TrimLeft(string(body), " \t\n"), "{") {
		if modelsOk {
			return map[string]any{"kind": "zhipu_coding_plan", "plan_models": modelCount},
				"key 有效；余量接口响应解析失败"
		}
		return nil, "余量接口响应解析失败"
	}
	if quota.Code != 0 && quota.Code != 200 {
		if modelsOk {
			return map[string]any{"kind": "zhipu_coding_plan", "plan_models": modelCount},
				fmt.Sprintf("key 有效；余量接口返回 %d（%s）", quota.Code, quota.Msg)
		}
		return nil, fmt.Sprintf("余量接口返回 %d（%s）", quota.Code, quota.Msg)
	}

	// 双窗口：unit 3 = 小时（5h 主窗口），unit 6 = 周（每周总窗口）
	windows := make([]map[string]any, 0, len(quota.Data.Limits))
	for _, l := range quota.Data.Limits {
		if l.Type != "CREDIT_LIMIT" {
			continue
		}
		windows = append(windows, map[string]any{
			"unit":            l.Unit,
			"number":          l.Number,
			"total":           l.Usage,
			"remaining":       l.Remaining,
			"percentage":      l.Percentage,
			"next_reset_time": l.NextResetTime,
		})
	}
	info := map[string]any{
		"kind":        "zhipu_coding_plan",
		"plan_models": modelCount,
		"plan_level":  quota.Data.Level,
		"windows":     windows,
	}
	if len(windows) == 0 {
		return info, "key 有效；余量接口未返回额度窗口"
	}
	return info, ""
}

func probeOpenAIBilling(base, key string) (map[string]any, string) {
	info := map[string]any{"kind": "openai_billing"}
	code, body, err := upstreamQuotaGet(strings.TrimRight(base, "/")+"/v1/dashboard/billing/subscription", key)
	if err != nil || code != http.StatusOK {
		return nil, fmt.Sprintf("计费接口返回 %d", code)
	}
	var sub struct {
		HardLimitUSD float64 `json:"hard_limit_usd"`
		SoftLimitUSD float64 `json:"soft_limit_usd"`
	}
	if err := common.Unmarshal(body, &sub); err != nil {
		return nil, "计费接口响应解析失败"
	}
	info["hard_limit_usd"] = sub.HardLimitUSD
	info["soft_limit_usd"] = sub.SoftLimitUSD

	tomorrow := time.Now().AddDate(0, 0, 1).Format("2006-01-02")
	monthStart := time.Now().Format("2006-01") + "-01"
	code, body, err = upstreamQuotaGet(
		fmt.Sprintf("%s/v1/dashboard/billing/usage?start_date=%s&end_date=%s", strings.TrimRight(base, "/"), monthStart, tomorrow), key)
	if err == nil && code == http.StatusOK {
		var usage struct {
			TotalUsage float64 `json:"total_usage"` // 单位：美分
		}
		if common.Unmarshal(body, &usage) == nil && usage.TotalUsage > 0 {
			info["month_used_usd"] = usage.TotalUsage / 100
		}
	}
	return info, ""
}

// GetUpstreamQuotaMonitor GET /api/user/quota_monitor
func GetUpstreamQuotaMonitor(c *gin.Context) {
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]UpstreamQuotaItem, len(channels))
	var wg sync.WaitGroup
	for i, ch := range channels {
		wg.Go(func() {
			item := UpstreamQuotaItem{
				Id:           ch.Id,
				Name:         ch.Name,
				Type:         ch.Type,
				Status:       ch.Status,
				ResponseTime: ch.ResponseTime,
				TestTime:     ch.TestTime,
				UsedQuota:    ch.UsedQuota,
				Balance:      ch.Balance,
			}
			if ch.BaseURL != nil {
				item.BaseURL = strings.TrimSpace(*ch.BaseURL)
			}
			item.Upstream, item.Note = probeUpstreamQuota(ch)
			items[i] = item
		})
	}
	wg.Wait()

	common.ApiSuccess(c, items)
}
