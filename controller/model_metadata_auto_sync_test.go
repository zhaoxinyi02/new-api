package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMetadataModelKeyNormalization(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "dotted version matches dashes", input: "glm-5.3-flash", expected: "glm-5-3-flash"},
		{name: "dashed version matches dotted", input: "glm-5-3-flash", expected: "glm-5-3-flash"},
		{name: "dated snapshot loses its date", input: "doubao-seed-2-1-pro-260628", expected: "doubao-seed-2-1-pro"},
		{name: "rolling alias is unchanged", input: "doubao-seed-2-1-pro", expected: "doubao-seed-2-1-pro"},
		{name: "ga suffix is dropped", input: "deepseek-v4-pro-ga", expected: "deepseek-v4-pro"},
		{name: "vendor casing is folded", input: "MiniMax-M3", expected: "minimax-m3"},
		{name: "underscores are folded", input: "Doubao_Seed_Evolving", expected: "doubao-seed-evolving"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, metadataModelKey(tc.input))
		})
	}
}

// The catalog spells some models differently from the ids Ark serves; the
// resolver has to bridge that for every model the site publishes.
func TestMetadataResolverMatchesCatalogSpellings(t *testing.T) {
	upstream := map[string]model.MetadataValues{}
	for _, name := range []string{
		"doubao-seed-evolving",
		"doubao-seed-2-1-pro-260628",
		"doubao-seed-2.0-lite",
		"doubao-seed-2-0-lite-260428",
		"doubao-seed-2-1-turbo-260628",
		"deepseek-v4-flash",
		"deepseek-v4-pro",
		"glm-5.3",
		"glm-5.3-flash",
		"kimi-k3",
		"kimi-k2.7-code",
		"MiniMax-M3",
	} {
		upstream[name] = model.MetadataValues{Description: name, Vendor: "Vendor of " + name, Status: 1}
	}
	resolver := newMetadataResolver(upstream)
	for _, tc := range []struct{ site, catalog string }{
		{site: "doubao-seed-evolving", catalog: "doubao-seed-evolving"},
		{site: "doubao-seed-2-1-pro", catalog: "doubao-seed-2-1-pro-260628"},
		{site: "doubao-seed-2-0-lite", catalog: "doubao-seed-2.0-lite"},
		{site: "doubao-seed-2-1-turbo", catalog: "doubao-seed-2-1-turbo-260628"},
		{site: "deepseek-v4-1-flash", catalog: "deepseek-v4-flash"},
		{site: "deepseek-v4-pro-ga", catalog: "deepseek-v4-pro"},
		{site: "glm-5-3-flash", catalog: "glm-5.3-flash"},
		{site: "glm-5.3", catalog: "glm-5.3"},
		{site: "kimi-k3", catalog: "kimi-k3"},
		{site: "kimi-k2.7-code", catalog: "kimi-k2.7-code"},
		{site: "minimax-m3", catalog: "MiniMax-M3"},
	} {
		t.Run(tc.site, func(t *testing.T) {
			values, ok := resolver.resolve(tc.site)
			require.True(t, ok, "expected %s to resolve", tc.site)
			assert.Equal(t, tc.catalog, values.Description)
		})
	}
	_, ok := resolver.resolve("kimi-k2-8-preview")
	assert.False(t, ok, "a model the catalog does not document must stay unresolved")
}

// The rolling alias carries no snapshot date, so it wins over the dated
// snapshot when both describe the same model.
func TestMetadataResolverPrefersUndatedAlias(t *testing.T) {
	upstream := map[string]model.MetadataValues{
		"doubao-seed-2-0-lite":        {Description: "rolling"},
		"doubao-seed-2-0-lite-260428": {Description: "snapshot"},
	}
	resolver := newMetadataResolver(upstream)
	values, ok := resolver.resolve("doubao-seed-2-0-lite")
	require.True(t, ok)
	assert.Equal(t, "rolling", values.Description)
}

func TestRunModelMetadataAutoSyncFillsSiteModels(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload any
		if strings.HasSuffix(r.URL.Path, "vendors.json") {
			payload = []upstreamVendor{
				{Name: "Volcengine Ark", Icon: "Doubao.Color", Status: 1},
				{Name: "Moonshot AI", Icon: "Moonshot", Status: 1},
			}
		} else {
			payload = []upstreamModel{
				{ModelName: "doubao-seed-2-1-pro-260628", Description: "ByteDance Seed 2.1 Pro", Icon: "Doubao.Color", Tags: "Reasoning", VendorName: "Volcengine Ark", Status: 1},
				{ModelName: "kimi-k3", Description: "Multimodal Kimi", Icon: "Moonshot", Tags: "Tools", VendorName: "Moonshot AI", Status: 1},
			}
		}
		encoded, err := common.Marshal(payload)
		require.NoError(t, err)
		_, _ = w.Write(encoded)
	}))
	defer upstream.Close()
	t.Setenv("SYNC_UPSTREAM_BASE", upstream.URL)
	t.Setenv("SYNC_HTTP_RETRY", "1")

	// Two models the site serves, one of which the admin pinned: it must keep
	// its local description. A third model has no catalog entry at all.
	require.NoError(t, db.Create(&[]model.Ability{
		{Model: "doubao-seed-2-1-pro", Group: "default", ChannelId: 1, Enabled: true},
		{Model: "kimi-k3", Group: "default", ChannelId: 1, Enabled: true},
		{Model: "kimi-k2-8-preview", Group: "default", ChannelId: 1, Enabled: true},
	}).Error)
	pinned := &model.Model{ModelName: "kimi-k3", Description: "Pinned description", Icon: "Moonshot", Tags: "Tools", Status: 1, SyncOfficial: 0}
	require.NoError(t, pinned.Insert())

	summary, err := runModelMetadataAutoSyncOnce(context.Background(), "zh")
	require.NoError(t, err)
	assert.Equal(t, 3, summary.CheckedModels)
	assert.Equal(t, []string{"doubao-seed-2-1-pro"}, summary.CreatedModels)
	assert.Empty(t, summary.UpdatedModels)
	assert.Equal(t, []string{"Volcengine Ark"}, summary.CreatedVendors)
	assert.Equal(t, []string{"kimi-k2-8-preview"}, summary.UnresolvedModels)

	var created model.Model
	require.NoError(t, db.Where("model_name = ?", "doubao-seed-2-1-pro").First(&created).Error)
	assert.Equal(t, "ByteDance Seed 2.1 Pro", created.Description)
	assert.Equal(t, "Doubao.Color", created.Icon)
	assert.Equal(t, "Reasoning", created.Tags)
	assert.Equal(t, 1, created.SyncOfficial)
	var vendor model.Vendor
	require.NoError(t, db.First(&vendor, created.VendorID).Error)
	assert.Equal(t, "Volcengine Ark", vendor.Name)
	assert.Equal(t, "Doubao.Color", vendor.Icon)

	var reloaded model.Model
	require.NoError(t, db.First(&reloaded, pinned.Id).Error)
	assert.Equal(t, "Pinned description", reloaded.Description)

	// A second run finds nothing left to change.
	summary, err = runModelMetadataAutoSyncOnce(context.Background(), "zh")
	require.NoError(t, err)
	assert.Empty(t, summary.CreatedModels)
	assert.Empty(t, summary.UpdatedModels)
}

func TestRunModelMetadataAutoSyncRefreshesChangedCatalogValues(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	var description string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload any
		if strings.HasSuffix(r.URL.Path, "vendors.json") {
			payload = []upstreamVendor{}
		} else {
			payload = []upstreamModel{{ModelName: "glm-5.3-flash", Description: description, Icon: "ZAI", Tags: "Reasoning", Status: 1}}
		}
		encoded, err := common.Marshal(payload)
		require.NoError(t, err)
		_, _ = w.Write(encoded)
	}))
	defer upstream.Close()
	t.Setenv("SYNC_UPSTREAM_BASE", upstream.URL)
	t.Setenv("SYNC_HTTP_RETRY", "1")

	description = "first"
	existing := &model.Model{ModelName: "glm-5-3-flash", Description: "stale", SyncOfficial: 1, Status: 1}
	require.NoError(t, existing.Insert())
	summary, err := runModelMetadataAutoSyncOnce(context.Background(), "zh")
	require.NoError(t, err)
	assert.Equal(t, []string{"glm-5-3-flash"}, summary.UpdatedModels)
	var reloaded model.Model
	require.NoError(t, db.First(&reloaded, existing.Id).Error)
	assert.Equal(t, "first", reloaded.Description)
	assert.Equal(t, "ZAI", reloaded.Icon)

	description = "second"
	summary, err = runModelMetadataAutoSyncOnce(context.Background(), "zh")
	require.NoError(t, err)
	assert.Equal(t, []string{"glm-5-3-flash"}, summary.UpdatedModels)
	require.NoError(t, db.First(&reloaded, existing.Id).Error)
	assert.Equal(t, "second", reloaded.Description)
	assert.Equal(t, common.GetTimestamp(), reloaded.UpdatedTime)
}

func TestMetadataFieldDiffReportsEveryFieldForMissingRecord(t *testing.T) {
	assert.ElementsMatch(t, model.MetadataSyncFields, metadataFieldDiff(nil, nil, model.MetadataValues{}))
	// An unchanged record diffs to nothing, so the auto-sync stops rewriting it.
	local := &model.Model{Description: "d", Icon: "i", Tags: "t", Status: 1}
	assert.Empty(t, metadataFieldDiff(local, nil, model.MetadataValues{Description: "d", Icon: "i", Tags: "t", Status: 1}))
	assert.Equal(t, []string{"icon"}, metadataFieldDiff(local, nil, model.MetadataValues{Description: "d", Icon: "other", Tags: "t", Status: 1}))
	assert.Equal(t, []string{"vendor"}, metadataFieldDiff(local, &model.Vendor{Name: "Old"}, model.MetadataValues{Description: "d", Icon: "i", Tags: "t", Status: 1, Vendor: "New"}))
}
