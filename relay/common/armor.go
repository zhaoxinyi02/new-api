package common

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relaykit/types"
	armorsetting "github.com/QuantumNous/new-api/setting/armor_setting"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// 破甲注入 / Armor inject
//
// 中转站在把请求体发给上游之前，把破甲提示词塞进「系统位」，
// 于是中转站出口的每个模型默认就是破甲模型 —— 用户侧照常调用 API，不改任何东西。
//
// 收口点在 relay/channel 的 doRequest：无论走哪条协议转换链
// （OpenAI / Claude / Gemini / Responses / 直通），最终发给上游的 JSON
// 都会经过这里，一处生效、全格式覆盖。
//
// 系统位按上游协议形态识别，不依赖 RelayMode：
//
//	OpenAI     messages[]，第一条是 system/developer 就并入它，否则新插一条
//	Claude     顶层 system（string 或 block 数组）
//	Gemini     systemInstruction / system_instruction.parts
//	Responses  instructions（缺失则补一条）
//
// 幂等：注入文本头部自带 armor_setting.marker（默认 <project_instructions>），
// 请求体重试、客户端自带同一份提示词时都不会重复注入。

// ArmorInjectBody 按上游协议形态把破甲提示词注入请求体。
// 返回注入后的 body、是否发生变化、错误。
// 未开启 / 命中豁免 / 型号不在名单 / 已经注入过，都会原样返回 body 且 changed=false。
func ArmorInjectBody(body []byte, info *RelayInfo) ([]byte, bool, error) {
	cfg := armorsetting.GetArmorSetting()
	if cfg == nil || !cfg.Enabled || len(body) == 0 {
		return body, false, nil
	}
	if limit := armorsetting.EffectiveMaxBodyBytes(cfg); limit > 0 && len(body) > limit {
		return body, false, nil
	}
	if !armorsetting.ModelAllowed(cfg, armorModelName(info)) {
		return body, false, nil
	}
	if armoredFormatExempt(info) {
		return body, false, nil
	}
	marker := armorsetting.EffectiveMarker(cfg)
	if armorContainsMarker(body, marker) {
		return body, false, nil
	}
	prompt := armorsetting.ResolvePrompt(cfg, armorModelName(info))
	if prompt == "" {
		return body, false, nil
	}
	if !strings.Contains(prompt, marker) {
		// 自定义提示词里没有幂等标记时补一行，保证重试不会叠加第二份。
		prompt = marker + "\n" + prompt
	}
	quoted, err := common.Marshal(prompt)
	if err != nil {
		return body, false, err
	}
	mode := strings.TrimSpace(cfg.InjectMode)
	if mode == "" {
		mode = armorsetting.InjectModeMergeSystem
	}
	quotedPrompt := string(quoted)

	if messages := gjson.GetBytes(body, "messages"); messages.Exists() && messages.IsArray() {
		// 顶层 system 是 Claude 形态：system 必须在顶层，不能塞进 messages。
		if system := gjson.GetBytes(body, "system"); system.Exists() || armorIsClaudeFormat(info) {
			return armorInjectClaudeSystem(body, system, prompt, quotedPrompt, mode)
		}
		return armorInjectMessages(body, messages.Raw, prompt, quotedPrompt, mode)
	}
	if system := gjson.GetBytes(body, "system"); system.Exists() {
		return armorInjectClaudeSystem(body, system, prompt, quotedPrompt, mode)
	}
	if gjson.GetBytes(body, "contents").Exists() ||
		gjson.GetBytes(body, "systemInstruction").Exists() ||
		gjson.GetBytes(body, "system_instruction").Exists() {
		return armorInjectGeminiSystem(body, prompt, quotedPrompt, mode)
	}
	if instructions := gjson.GetBytes(body, "instructions"); instructions.Exists() {
		return armorInjectInstructions(body, instructions, prompt, quotedPrompt, mode)
	}
	// Responses 的 input-only 请求体：没有 instructions 时补一条。
	if gjson.GetBytes(body, "input").Exists() && armorIsResponsesFormat(info) {
		out, setErr := sjson.SetBytes(body, "instructions", prompt)
		return out, setErr == nil, setErr
	}
	if cfg.InjectPromptField {
		if out, changed, err := armorInjectLegacyPrompt(body, prompt, mode); changed || err != nil {
			return out, changed, err
		}
	}
	return body, false, nil
}

// armorInjectMessages 处理 OpenAI 的 messages 数组。
// mode=merge_system：第一条就是 system/developer 时并入其前；否则新插一条。
// mode=prepend：永远新插一条，保留对方原有的 system 消息。
// mode=override：第一条是 system 时直接覆盖其内容，不新增消息。
func armorInjectMessages(body []byte, rawMessages string, prompt string, quotedPrompt string, mode string) ([]byte, bool, error) {
	firstRole := strings.ToLower(strings.TrimSpace(gjson.Get(rawMessages, "0.role").String()))
	hasSystemHead := firstRole == "system" || firstRole == "developer"
	content := gjson.Get(rawMessages, "0.content")

	if hasSystemHead && mode != armorsetting.InjectModePrepend {
		switch {
		case content.IsArray():
			block := fmt.Sprintf(`{"type":"text","text":%s}`, quotedPrompt)
			out, err := sjson.SetRawBytes(body, "messages.0.content", []byte(prependRawArrayElement(content.Raw, block)))
			return out, err == nil, err
		case content.Type == gjson.String:
			merged := prompt
			if existing := content.String(); existing != "" && mode != armorsetting.InjectModeOverride {
				merged = prompt + "\n\n" + existing
			}
			out, err := sjson.SetBytes(body, "messages.0.content", merged)
			return out, err == nil, err
		default:
			// content 缺失 / null / 非文本形态：直接补上提示词。
			out, err := sjson.SetBytes(body, "messages.0.content", prompt)
			return out, err == nil, err
		}
	}
	// 没有系统位，或 prepend 模式：新插一条 system 消息放在最前。
	item := fmt.Sprintf(`{"role":"system","content":%s}`, quotedPrompt)
	out, err := sjson.SetRawBytes(body, "messages", []byte(prependRawArrayElement(rawMessages, item)))
	return out, err == nil, err
}

// armorInjectClaudeSystem 处理 Claude 顶层 system（string 或 content block 数组）。
func armorInjectClaudeSystem(body []byte, system gjson.Result, prompt string, quotedPrompt string, mode string) ([]byte, bool, error) {
	switch {
	case system.IsArray():
		block := fmt.Sprintf(`{"type":"text","text":%s}`, quotedPrompt)
		out, err := sjson.SetRawBytes(body, "system", []byte(prependRawArrayElement(system.Raw, block)))
		return out, err == nil, err
	case system.Type == gjson.String:
		out, err := sjson.SetBytes(body, "system", armorJoinPrompt(prompt, system.String(), mode))
		return out, err == nil, err
	default:
		out, err := sjson.SetBytes(body, "system", prompt)
		return out, err == nil, err
	}
}

// armorInjectGeminiSystem 处理 Gemini 的 systemInstruction.parts（兼容 snake_case 变体）。
func armorInjectGeminiSystem(body []byte, prompt string, quotedPrompt string, mode string) ([]byte, bool, error) {
	for _, key := range []string{"systemInstruction", "system_instruction"} {
		current := gjson.GetBytes(body, key)
		if !current.Exists() || current.Type == gjson.Null {
			continue
		}
		if current.Type == gjson.String {
			out, err := sjson.SetBytes(body, key, armorJoinPrompt(prompt, current.String(), mode))
			return out, err == nil, err
		}
		parts := current.Get("parts")
		if parts.IsArray() {
			part := fmt.Sprintf(`{"text":%s}`, quotedPrompt)
			out, err := sjson.SetRawBytes(body, key+".parts", []byte(prependRawArrayElement(parts.Raw, part)))
			return out, err == nil, err
		}
		out, err := sjson.SetRawBytes(body, key+".parts", []byte(fmt.Sprintf(`[{"text":%s}]`, quotedPrompt)))
		return out, err == nil, err
	}
	out, err := sjson.SetRawBytes(body, "systemInstruction", []byte(fmt.Sprintf(`{"parts":[{"text":%s}]}`, quotedPrompt)))
	return out, err == nil, err
}

// armorInjectInstructions 处理 Responses API 的顶层 instructions。
func armorInjectInstructions(body []byte, instructions gjson.Result, prompt string, quotedPrompt string, mode string) ([]byte, bool, error) {
	if instructions.IsArray() {
		block := fmt.Sprintf(`{"type":"input_text","text":%s}`, quotedPrompt)
		out, err := sjson.SetRawBytes(body, "instructions", []byte(prependRawArrayElement(instructions.Raw, block)))
		return out, err == nil, err
	}
	out, err := sjson.SetBytes(body, "instructions", armorJoinPrompt(prompt, instructions.String(), mode))
	return out, err == nil, err
}

// armorInjectLegacyPrompt 处理老式 /v1/completions 的顶层 prompt 字段。
func armorInjectLegacyPrompt(body []byte, prompt string, mode string) ([]byte, bool, error) {
	result := gjson.GetBytes(body, "prompt")
	if !result.Exists() {
		return body, false, nil
	}
	switch {
	case result.IsArray():
		first := gjson.Get(result.Raw, "0")
		if !first.Exists() || first.Type != gjson.String {
			return body, false, nil
		}
		out, err := sjson.SetBytes(body, "prompt.0", armorJoinPrompt(prompt, first.String(), mode))
		return out, err == nil, err
	case result.Type == gjson.String:
		out, err := sjson.SetBytes(body, "prompt", armorJoinPrompt(prompt, result.String(), mode))
		return out, err == nil, err
	default:
		return body, false, nil
	}
}

// armorJoinPrompt 按注入模式拼接提示词与原有系统文本。
func armorJoinPrompt(prompt string, existing string, mode string) string {
	existing = strings.TrimSpace(existing)
	if existing == "" {
		return prompt
	}
	if mode == armorsetting.InjectModeOverride {
		return prompt
	}
	return prompt + "\n\n" + existing
}

// prependRawArrayElement 在原始 JSON 数组文本前面插入一个元素，
// 剩下的元素保持字节级原样，不做解析再序列化（避免丢字段顺序与精度）。
func prependRawArrayElement(rawArray string, element string) string {
	inner := strings.TrimSpace(rawArray)
	inner = strings.TrimPrefix(inner, "[")
	inner = strings.TrimSuffix(inner, "]")
	inner = strings.TrimSpace(inner)
	if inner == "" {
		return "[" + element + "]"
	}
	return "[" + element + "," + inner + "]"
}

// armorModelName 取用于名单与按模型提示词匹配的模型名。
func armorModelName(info *RelayInfo) string {
	if info == nil {
		return ""
	}
	if name := info.GetOriginModelName(); name != "" {
		return name
	}
	return info.GetUpstreamModelName()
}

// armoredFormatExempt 非对话类出口不注入：向量、重排、语音、图像、任务。
func armoredFormatExempt(info *RelayInfo) bool {
	if info == nil {
		return false
	}
	switch info.GetFinalRequestRelayFormat() {
	case types.RelayFormatEmbedding, types.RelayFormatRerank, types.RelayFormatOpenAIAudio, types.RelayFormatOpenAIImage, types.RelayFormatTask, types.RelayFormatMjProxy:
		return true
	}
	return false
}

func armorIsResponsesFormat(info *RelayInfo) bool {
	if info == nil {
		return false
	}
	format := info.GetFinalRequestRelayFormat()
	return format == types.RelayFormatOpenAIResponses || format == types.RelayFormatOpenAIResponsesCompaction
}

// armorContainsMarker 判断请求体里是否已经带上注入标记。
// JSON 编码器会把标记里的 < > & 转义（\u003c / \u003e / \u0026），
// 所以原始形态和转义形态都要查，重试才不会叠加第二份提示词。
func armorContainsMarker(body []byte, marker string) bool {
	if bytes.Contains(body, []byte(marker)) {
		return true
	}
	escaped, err := common.Marshal(marker)
	if err != nil {
		return false
	}
	trimmed := strings.Trim(string(escaped), `"`)
	return trimmed != marker && bytes.Contains(body, []byte(trimmed))
}

// armorIsClaudeFormat 判断上游出口是不是 Claude 原生格式。
func armorIsClaudeFormat(info *RelayInfo) bool {
	return info != nil && info.GetFinalRequestRelayFormat() == types.RelayFormatClaude
}

// armorRestoreBody 重新拿回一个可读的原 body（优先走 GetBody 的重放能力）。
func armorRestoreBody(req *http.Request) io.ReadCloser {
	if req.GetBody != nil {
		if body, err := req.GetBody(); err == nil {
			return body
		}
	}
	return http.NoBody
}

// ArmorInjectOutboundRequest 是挂在 doRequest 上的收口：把已经构造好的上游请求体
// 读出来注入破甲提示词，再换成新 body。返回是否真的注入。
func ArmorInjectOutboundRequest(c *gin.Context, req *http.Request, info *RelayInfo) (bool, error) {
	cfg := armorsetting.GetArmorSetting()
	if cfg == nil || !cfg.Enabled || req == nil || req.Body == nil {
		return false, nil
	}
	if contentType := strings.ToLower(req.Header.Get("Content-Type")); contentType != "" && !strings.Contains(contentType, "json") {
		// multipart（语音、图像编辑）等非 JSON 出口不做文本注入。
		return false, nil
	}
	if limit := int64(armorsetting.EffectiveMaxBodyBytes(cfg)); req.ContentLength > limit {
		// 已知体积超上限时直接放行，不把大 base64 请求读进内存。
		return false, nil
	}
	body, err := io.ReadAll(req.Body)
	_ = req.Body.Close()
	if err != nil {
		// 读失败就尽量把 body 复原，让请求按原样继续，而不是发一个空 body 给上游。
		req.Body = armorRestoreBody(req)
		return false, fmt.Errorf("armor: read outbound body failed: %w", err)
	}
	injected, changed, injectErr := ArmorInjectBody(body, info)
	if injectErr != nil {
		return false, fmt.Errorf("armor: inject failed: %w", injectErr)
	}
	if !changed {
		req.Body = io.NopCloser(bytes.NewReader(body))
		return false, nil
	}
	req.Body = io.NopCloser(bytes.NewReader(injected))
	req.ContentLength = int64(len(injected))
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(injected)), nil
	}
	req.Header.Set("Content-Length", strconv.Itoa(len(injected)))
	if c != nil {
		logger.LogDebug(c, "armor injected: model=%s mode=%s bytes=%d->%d", armorModelName(info), cfg.InjectMode, len(body), len(injected))
	}
	return true, nil
}
