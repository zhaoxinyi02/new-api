// Package armor_setting 是「破甲注入」的全局配置层。
//
// 目标：把这套破甲提示词内置进中转站，中转到上游之前命中每一条请求体，
// 让中转站出口的模型默认就是破甲模型 —— 用户侧不用改任何调用方式，
// 照常 POST /v1/chat/completions 即可。
//
// 配置走 new-api 既有的 config.GlobalConfig 机制：
//   - 前缀 armor_setting.（例如 armor_setting.enabled / armor_setting.prompt）
//   - 后台 PUT /api/option/ 即时生效，无需重启
//   - 未配置任何 DB 行时直接吃这里的默认值（默认开启 + 内置提示词）
package armor_setting

import (
	_ "embed"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/setting/config"
)

// armor_prompt.md 是从 dsh-purge（lib/asset-table.js 加密槽）解出来的默认破甲提示词，
// 已剥掉宿主的 ChatML 头（<|im_start|>system:），保留 <project_instructions> 本体。
//
//go:embed armor_prompt.md
var bundledPrompt string

// 注入模式
const (
	// InjectModeMergeSystem 默认。已有 system 位置就并在它前面，没有就新插一条。
	InjectModeMergeSystem = "merge_system"
	// InjectModePrepend 永远新插一条 system 消息，保留对方原有的 system 原文。
	InjectModePrepend = "prepend"
	// InjectModeOverride 覆盖已有 system 内容（丢掉上游/客户端原来的 system）。
	InjectModeOverride = "override"
)

// DefaultMarker 幂等标记。请求体里已经出现它，就认为本次请求已经注过，跳过。
// 内置提示词头部自带 <project_instructions>，重试、客户端自带都不会重复注入。
const DefaultMarker = "<project_instructions>"

// ArmorSetting 破甲注入配置。
type ArmorSetting struct {
	// Enabled 总开关。默认 true：装好即破甲。
	Enabled bool `json:"enabled"`
	// Prompt 自定义破甲提示词。留空 = 用内置 armored 提示词（armor_prompt.md）。
	Prompt string `json:"prompt"`
	// InjectMode merge_system | prepend | override
	InjectMode string `json:"inject_mode"`
	// IncludeModels 白名单（支持 * 通配）。为空 = 全部模型。
	IncludeModels []string `json:"include_models"`
	// ExcludeModels 黑名单（支持 * 通配）。黑名单优先。
	ExcludeModels []string `json:"exclude_models"`
	// PromptsByModel 按模型换提示词：{"gpt-5*":"...","deepseek-*":"..."}。
	// 先精确匹配，再按通配匹配，都没有就走 Prompt / 内置默认。
	PromptsByModel map[string]string `json:"prompts_by_model"`
	// Marker 幂等标记，默认 <project_instructions>。
	Marker string `json:"marker"`
	// MaxBodyBytes 超过这个体积不再解析注入（防止大 base64 请求被整份读进内存）。0 = 用默认 8MiB。
	MaxBodyBytes int `json:"max_body_bytes"`
	// InjectPromptField 是否也注入老式 /v1/completions 的顶层 prompt 字段。默认 false。
	InjectPromptField bool `json:"inject_prompt_field"`
}

const defaultMaxBodyBytes = 8 << 20

var armorSetting = ArmorSetting{
	Enabled:           true,
	InjectMode:        InjectModeMergeSystem,
	Marker:            DefaultMarker,
	MaxBodyBytes:      defaultMaxBodyBytes,
	InjectPromptField: false,
}

func init() {
	config.GlobalConfig.Register("armor_setting", &armorSetting)
}

// GetArmorSetting 返回全局配置对象（指针，改动即时生效）。
func GetArmorSetting() *ArmorSetting {
	return &armorSetting
}

// BundledPrompt 返回内置破甲提示词原文。
func BundledPrompt() string {
	return bundledPrompt
}

// EffectiveMaxBodyBytes 归一化体积上限。
func EffectiveMaxBodyBytes(cfg *ArmorSetting) int {
	if cfg == nil || cfg.MaxBodyBytes <= 0 {
		return defaultMaxBodyBytes
	}
	return cfg.MaxBodyBytes
}

// EffectiveMarker 归一化幂等标记。
func EffectiveMarker(cfg *ArmorSetting) string {
	if cfg == nil {
		return DefaultMarker
	}
	marker := strings.TrimSpace(cfg.Marker)
	if marker == "" {
		return DefaultMarker
	}
	return marker
}

// ModelAllowed 判断该模型是否需要注入。
// 规则：黑名单优先；白名单为空表示全放行。
func ModelAllowed(cfg *ArmorSetting, model string) bool {
	if cfg == nil {
		return false
	}
	model = strings.TrimSpace(model)
	if model == "" {
		// 取不到模型名（极少见）时按放行处理，宁可注入不遗漏。
		return true
	}
	for _, pattern := range cfg.ExcludeModels {
		if WildcardMatch(pattern, model) {
			return false
		}
	}
	if len(cfg.IncludeModels) == 0 {
		return true
	}
	for _, pattern := range cfg.IncludeModels {
		if WildcardMatch(pattern, model) {
			return true
		}
	}
	return false
}

// rawPromptForModel 依次取：精确模型提示词 → 通配模型提示词 → 全局 Prompt → 内置默认。
func rawPromptForModel(cfg *ArmorSetting, model string) string {
	if cfg == nil {
		return bundledPrompt
	}
	model = strings.TrimSpace(model)
	if model != "" && len(cfg.PromptsByModel) > 0 {
		if p, ok := cfg.PromptsByModel[model]; ok && strings.TrimSpace(p) != "" {
			return p
		}
		// 通配匹配。map 遍历顺序随机，多命中时取匹配模式最长的那条，保证结果稳定。
		bestPattern := ""
		bestPrompt := ""
		for pattern, p := range cfg.PromptsByModel {
			if strings.TrimSpace(p) == "" || !WildcardMatch(pattern, model) {
				continue
			}
			if len(pattern) > len(bestPattern) {
				bestPattern, bestPrompt = pattern, p
			}
		}
		if bestPrompt != "" {
			return bestPrompt
		}
	}
	if strings.TrimSpace(cfg.Prompt) != "" {
		return cfg.Prompt
	}
	return bundledPrompt
}

type promptCacheEntry struct {
	raw      string
	resolved string
}

var promptCache sync.Map // model -> promptCacheEntry

// ResolvePrompt 返回最终注入文本（已 trim、LR 归一）。按模型缓存，避免每请求重排 20KB 字符串。
func ResolvePrompt(cfg *ArmorSetting, model string) string {
	raw := rawPromptForModel(cfg, model)
	if cached, ok := promptCache.Load(model); ok {
		if entry, ok := cached.(promptCacheEntry); ok && entry.raw == raw {
			return entry.resolved
		}
	}
	resolved := NormalizePrompt(raw)
	promptCache.Store(model, promptCacheEntry{raw: raw, resolved: resolved})
	return resolved
}

// NormalizePrompt 统一换行并去掉首尾空白。
func NormalizePrompt(text string) string {
	return strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n"))
}

// WildcardMatch 轻量通配匹配：支持 * 和 ?，不把 / 当分隔符（模型名可能带斜杠）。
func WildcardMatch(pattern string, s string) bool {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return false
	}
	p, n := 0, 0
	star, mark := -1, 0
	for n < len(s) {
		switch {
		case p < len(pattern) && (pattern[p] == '?' || pattern[p] == s[n]):
			p++
			n++
		case p < len(pattern) && pattern[p] == '*':
			star = p
			mark = n
			p++
		case star >= 0:
			p = star + 1
			mark++
			n = mark
		default:
			return false
		}
	}
	for p < len(pattern) && pattern[p] == '*' {
		p++
	}
	return p == len(pattern)
}
