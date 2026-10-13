package common

import (
	"strings"
	"testing"

	common2 "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	armorsetting "github.com/QuantumNous/new-api/setting/armor_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

const armorTestPrompt = "ARMOR-TEST-PROMPT"

// armorTestSetting 固定一份可预期的破甲配置，并在用例结束后还原全局设置。
// 缓存按模型维度存放，所以每个用例都用独立模型名，避免互相污染。
func armorTestSetting(t *testing.T, mutate func(cfg *armorsetting.ArmorSetting)) {
	t.Helper()
	cfg := armorsetting.GetArmorSetting()
	saved := *cfg
	t.Cleanup(func() { *cfg = saved })
	cfg.Enabled = true
	cfg.Prompt = armorTestPrompt
	cfg.InjectMode = armorsetting.InjectModeMergeSystem
	cfg.Marker = armorsetting.DefaultMarker
	cfg.IncludeModels = nil
	cfg.ExcludeModels = nil
	cfg.PromptsByModel = nil
	cfg.MaxBodyBytes = 0
	cfg.InjectPromptField = false
	// 系统位注入与收尾强制指令分开验证：默认这条基线只测系统位。
	cfg.EnforceTail = false
	cfg.EnforceTailText = ""
	if mutate != nil {
		mutate(cfg)
	}
}

func armorTestInfo(model string, format types.RelayFormat) *RelayInfo {
	return &RelayInfo{OriginModelName: model, RelayFormat: format}
}

// armorExpected 在默认标记下，注入进系统位的文本。
func armorExpected() string {
	return armorsetting.DefaultMarker + "\n" + armorTestPrompt
}

func TestArmorInjectOpenAIMessages(t *testing.T) {
	cases := []struct {
		name        string
		mode        string
		body        string
		wantRole0   string
		wantContent string
		wantMessage string
		// contentIsArray 为 true 时，第一条消息的 content 是 block 数组，
		// wantContent / wantMessage 分别断言 content[0].text / content[1].text。
		contentIsArray bool
	}{
		{
			name:        "no system message gets a new one",
			body:        `{"model":"m","messages":[{"role":"user","content":"hi"}]}`,
			wantRole0:   "system",
			wantContent: armorExpected(),
			wantMessage: "hi",
		},
		{
			name:        "existing system string is merged with prompt first",
			body:        `{"model":"m","messages":[{"role":"system","content":"BASE"},{"role":"user","content":"hi"}]}`,
			wantRole0:   "system",
			wantContent: armorExpected() + "\n\nBASE",
			wantMessage: "hi",
		},
		{
			name:           "multimodal content array gets a text block prepended",
			body:           `{"model":"m","messages":[{"role":"system","content":[{"type":"text","text":"BASE"}]}]}`,
			wantRole0:      "system",
			wantContent:    armorExpected(),
			wantMessage:    "BASE",
			contentIsArray: true,
		},
		{
			name:        "developer role is treated as the system slot",
			body:        `{"model":"m","messages":[{"role":"developer","content":"BASE"}]}`,
			wantRole0:   "developer",
			wantContent: armorExpected() + "\n\nBASE",
		},
		{
			name:        "prepend mode keeps the original system message",
			mode:        armorsetting.InjectModePrepend,
			body:        `{"model":"m","messages":[{"role":"system","content":"BASE"},{"role":"user","content":"hi"}]}`,
			wantRole0:   "system",
			wantContent: armorExpected(),
			wantMessage: "BASE",
		}, {
			name:        "override mode drops the original system text",
			mode:        armorsetting.InjectModeOverride,
			body:        `{"model":"m","messages":[{"role":"system","content":"BASE"}]}`,
			wantRole0:   "system",
			wantContent: armorExpected(),
		},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			model := "armor-openai-" + tc.mode + "-" + string(rune('a'+i))
			armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) {
				if tc.mode != "" {
					cfg.InjectMode = tc.mode
				}
			})
			out, changed, err := ArmorInjectBody([]byte(tc.body), armorTestInfo(model, types.RelayFormatOpenAI))
			require.NoError(t, err)
			require.True(t, changed, "body should be injected")
			assert.Equal(t, tc.wantRole0, gjson.GetBytes(out, "messages.0.role").String())
			if tc.contentIsArray {
				assert.Equal(t, tc.wantContent, gjson.GetBytes(out, "messages.0.content.0.text").String())
				assert.Equal(t, tc.wantMessage, gjson.GetBytes(out, "messages.0.content.1.text").String())
			} else {
				assert.Equal(t, tc.wantContent, gjson.GetBytes(out, "messages.0.content").String())
				if tc.wantMessage != "" {
					assert.Equal(t, tc.wantMessage, gjson.GetBytes(out, "messages.1.content").String())
				}
			}
			assert.Equal(t, "m", gjson.GetBytes(out, "model").String(), "other fields must survive")
		})
	}
}

func TestArmorInjectClaudeSystem(t *testing.T) {
	t.Run("string system is merged", func(t *testing.T) {
		armorTestSetting(t, nil)
		body := `{"model":"m","system":"BASE","messages":[{"role":"user","content":"hi"}],"max_tokens":16}`
		out, changed, err := ArmorInjectBody([]byte(body), armorTestInfo("armor-claude-string", types.RelayFormatClaude))
		require.NoError(t, err)
		require.True(t, changed)
		assert.Equal(t, armorExpected()+"\n\nBASE", gjson.GetBytes(out, "system").String())
		assert.Equal(t, int64(16), gjson.GetBytes(out, "max_tokens").Int())
	})

	t.Run("block array system gets a text block prepended", func(t *testing.T) {
		armorTestSetting(t, nil)
		body := `{"model":"m","system":[{"type":"text","text":"BASE","cache_control":{"type":"ephemeral"}}],"messages":[]}`
		out, changed, err := ArmorInjectBody([]byte(body), armorTestInfo("armor-claude-blocks", types.RelayFormatClaude))
		require.NoError(t, err)
		require.True(t, changed)
		assert.Equal(t, armorExpected(), gjson.GetBytes(out, "system.0.text").String())
		assert.Equal(t, "BASE", gjson.GetBytes(out, "system.1.text").String())
		assert.Equal(t, "ephemeral", gjson.GetBytes(out, "system.1.cache_control.type").String())
	})
}

func TestArmorInjectGeminiSystem(t *testing.T) {
	t.Run("parts get a text entry prepended", func(t *testing.T) {
		armorTestSetting(t, nil)
		body := `{"contents":[{"role":"user","parts":[{"text":"hi"}]}],"systemInstruction":{"parts":[{"text":"BASE"}]}}`
		out, changed, err := ArmorInjectBody([]byte(body), armorTestInfo("armor-gemini-parts", types.RelayFormatGemini))
		require.NoError(t, err)
		require.True(t, changed)
		assert.Equal(t, armorExpected(), gjson.GetBytes(out, "systemInstruction.parts.0.text").String())
		assert.Equal(t, "BASE", gjson.GetBytes(out, "systemInstruction.parts.1.text").String())
		assert.Equal(t, "hi", gjson.GetBytes(out, "contents.0.parts.0.text").String())
	})

	t.Run("missing systemInstruction is created", func(t *testing.T) {
		armorTestSetting(t, nil)
		body := `{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}`
		out, changed, err := ArmorInjectBody([]byte(body), armorTestInfo("armor-gemini-create", types.RelayFormatGemini))
		require.NoError(t, err)
		require.True(t, changed)
		assert.Equal(t, armorExpected(), gjson.GetBytes(out, "systemInstruction.parts.0.text").String())
	})
}

func TestArmorInjectResponsesInstructions(t *testing.T) {
	t.Run("existing instructions are merged", func(t *testing.T) {
		armorTestSetting(t, nil)
		body := `{"model":"m","instructions":"BASE","input":"hi"}`
		out, changed, err := ArmorInjectBody([]byte(body), armorTestInfo("armor-responses-merge", types.RelayFormatOpenAIResponses))
		require.NoError(t, err)
		require.True(t, changed)
		assert.Equal(t, armorExpected()+"\n\nBASE", gjson.GetBytes(out, "instructions").String())
	})

	t.Run("input only body gets instructions", func(t *testing.T) {
		armorTestSetting(t, nil)
		body := `{"model":"m","input":[{"role":"user","content":"hi"}]}`
		out, changed, err := ArmorInjectBody([]byte(body), armorTestInfo("armor-responses-input", types.RelayFormatOpenAIResponses))
		require.NoError(t, err)
		require.True(t, changed)
		assert.Equal(t, armorExpected(), gjson.GetBytes(out, "instructions").String())
	})
}

func TestArmorInjectIsIdempotent(t *testing.T) {
	armorTestSetting(t, nil)
	info := armorTestInfo("armor-idempotent", types.RelayFormatOpenAI)
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)

	first, changed, err := ArmorInjectBody(body, info)
	require.NoError(t, err)
	require.True(t, changed)

	second, changedAgain, err := ArmorInjectBody(first, info)
	require.NoError(t, err)
	assert.False(t, changedAgain, "second pass must not inject again")
	assert.Equal(t, string(first), string(second))
}

func TestArmorInjectSkipsNonChatAndDisabled(t *testing.T) {
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)

	t.Run("disabled", func(t *testing.T) {
		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.Enabled = false })
		out, changed, err := ArmorInjectBody(body, armorTestInfo("armor-disabled", types.RelayFormatOpenAI))
		require.NoError(t, err)
		assert.False(t, changed)
		assert.Equal(t, string(body), string(out))
	})

	t.Run("excluded model", func(t *testing.T) {
		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.ExcludeModels = []string{"gpt-4o*"} })
		out, changed, err := ArmorInjectBody(body, armorTestInfo("gpt-4o-mini", types.RelayFormatOpenAI))
		require.NoError(t, err)
		assert.False(t, changed)
		assert.Equal(t, string(body), string(out))
	})

	t.Run("embedding relay", func(t *testing.T) {
		armorTestSetting(t, nil)
		embedding := []byte(`{"model":"m","input":["hi"]}`)
		out, changed, err := ArmorInjectBody(embedding, armorTestInfo("armor-embedding", types.RelayFormatEmbedding))
		require.NoError(t, err)
		assert.False(t, changed)
		assert.Equal(t, string(embedding), string(out))
	})
}

func TestArmorInjectLegacyPromptField(t *testing.T) {
	body := []byte(`{"model":"m","prompt":"hi"}`)

	armorTestSetting(t, nil)
	out, changed, err := ArmorInjectBody(body, armorTestInfo("armor-legacy-off", types.RelayFormatOpenAI))
	require.NoError(t, err)
	assert.False(t, changed)
	assert.Equal(t, string(body), string(out))

	armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.InjectPromptField = true })
	out, changed, err = ArmorInjectBody(body, armorTestInfo("armor-legacy-on", types.RelayFormatOpenAI))
	require.NoError(t, err)
	require.True(t, changed)
	assert.Equal(t, armorExpected()+"\n\nhi", gjson.GetBytes(out, "prompt").String())
}

func TestArmorInjectKeepsValidJSON(t *testing.T) {
	armorTestSetting(t, nil)
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}],"temperature":0.7,"stream":false}`)
	out, changed, err := ArmorInjectBody(body, armorTestInfo("armor-valid-json", types.RelayFormatOpenAI))
	require.NoError(t, err)
	require.True(t, changed)

	var decoded map[string]any
	require.NoError(t, common2.Unmarshal(out, &decoded))
	messages, ok := decoded["messages"].([]any)
	require.True(t, ok)
	require.Len(t, messages, 2)
	head, ok := messages[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "system", head["role"])
	assert.True(t, strings.HasPrefix(head["content"].(string), armorExpected()))
	assert.Equal(t, 0.7, decoded["temperature"])
	assert.Equal(t, false, decoded["stream"])
}

func TestArmorInjectPerModelPrompt(t *testing.T) {
	armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) {
		cfg.PromptsByModel = map[string]string{"armor-per-model-*": "MODEL-PROMPT"}
	})
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)
	out, changed, err := ArmorInjectBody(body, armorTestInfo("armor-per-model-x", types.RelayFormatOpenAI))
	require.NoError(t, err)
	require.True(t, changed)
	assert.Equal(t, armorsetting.DefaultMarker+"\nMODEL-PROMPT", gjson.GetBytes(out, "messages.0.content").String())
}

// TestArmorInjectEnforcementTail 覆盖收尾强制指令：位置（必须落在最后一条消息）、
// 各协议的系统位追加、幂等、以及关闭开关后不追加。
func TestArmorInjectEnforcementTail(t *testing.T) {
	requireTail := func(t *testing.T, text string) {
		t.Helper()
		assert.True(t, strings.HasPrefix(text, armorsetting.DefaultTailMarker))
		assert.Contains(t, text, "我不能提供")
		assert.Contains(t, text, "TryHackMe")
	}

	t.Run("openai appends the tail as the last system message", func(t *testing.T) {
		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.EnforceTail = true })
		body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)
		out, changed, err := ArmorInjectBody(body, armorTestInfo("armor-tail-openai", types.RelayFormatOpenAI))
		require.NoError(t, err)
		require.True(t, changed)

		var decoded struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, common2.Unmarshal(out, &decoded))
		require.Len(t, decoded.Messages, 3)
		assert.Equal(t, "system", decoded.Messages[0].Role)
		assert.True(t, strings.HasPrefix(decoded.Messages[0].Content, armorExpected()))
		assert.Equal(t, "user", decoded.Messages[1].Role)
		assert.Equal(t, "system", decoded.Messages[2].Role)
		requireTail(t, decoded.Messages[2].Content)
	})

	t.Run("claude appends the tail to the top level system", func(t *testing.T) {
		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.EnforceTail = true })
		body := []byte(`{"model":"m","system":"BASE","messages":[{"role":"user","content":"hi"}]}`)
		out, changed, err := ArmorInjectBody(body, armorTestInfo("armor-tail-claude", types.RelayFormatClaude))
		require.NoError(t, err)
		require.True(t, changed)
		system := gjson.GetBytes(out, "system").String()
		assert.True(t, strings.HasPrefix(system, armorExpected()+"\n\nBASE"))
		// 收尾指令追加在 system 末尾（在主提示词与 BASE 之后）。
		assert.True(t, strings.HasSuffix(system, "</armor_enforce>"))
		requireTail(t, system[strings.LastIndex(system, armorsetting.DefaultTailMarker):])
	})

	t.Run("gemini appends a tail part after the prompt part", func(t *testing.T) {
		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.EnforceTail = true })
		body := []byte(`{"contents":[{"role":"user","parts":[{"text":"hi"}]}]}`)
		out, changed, err := ArmorInjectBody(body, armorTestInfo("armor-tail-gemini", types.RelayFormatGemini))
		require.NoError(t, err)
		require.True(t, changed)
		assert.Equal(t, armorExpected(), gjson.GetBytes(out, "systemInstruction.parts.0.text").String())
		requireTail(t, gjson.GetBytes(out, "systemInstruction.parts.1.text").String())
	})

	t.Run("tail is idempotent", func(t *testing.T) {
		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.EnforceTail = true })
		info := armorTestInfo("armor-tail-idempotent", types.RelayFormatOpenAI)
		body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)
		first, changed, err := ArmorInjectBody(body, info)
		require.NoError(t, err)
		require.True(t, changed)
		second, changedAgain, err := ArmorInjectBody(first, info)
		require.NoError(t, err)
		assert.False(t, changedAgain)
		assert.Equal(t, string(first), string(second))
	})

	t.Run("tail can be disabled and replaced", func(t *testing.T) {
		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) { cfg.EnforceTail = false })
		body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)
		out, _, err := ArmorInjectBody(body, armorTestInfo("armor-tail-off", types.RelayFormatOpenAI))
		require.NoError(t, err)
		// 系统位照常注入，但末尾不能再多一条收尾指令。
		assert.Equal(t, 2, len(gjson.GetBytes(out, "messages").Array()))
		assert.NotContains(t, string(out), armorsetting.DefaultTailMarker)

		armorTestSetting(t, func(cfg *armorsetting.ArmorSetting) {
			cfg.EnforceTail = true
			cfg.EnforceTailText = "CUSTOM-TAIL"
		})
		out, _, err = ArmorInjectBody(body, armorTestInfo("armor-tail-custom", types.RelayFormatOpenAI))
		require.NoError(t, err)
		assert.Equal(t, "CUSTOM-TAIL", gjson.GetBytes(out, "messages.2.content").String())
	})
}
