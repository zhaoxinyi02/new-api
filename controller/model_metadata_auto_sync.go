package controller

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// The metadata auto-sync keeps every model the site actually serves populated
// from the upstream catalog. The manual sync wizard stays available for
// importing catalog-only entries and for reviewing individual edits.
const (
	metadataAutoSyncEnabledEnv    = "MODEL_METADATA_AUTO_SYNC_ENABLED"
	metadataAutoSyncIntervalEnv   = "MODEL_METADATA_AUTO_SYNC_INTERVAL_MINUTES"
	metadataAutoSyncLocaleEnv     = "MODEL_METADATA_AUTO_SYNC_LOCALE"
	metadataAutoSyncDefaultLocale = "zh"
)

func metadataAutoSyncEnabled() bool {
	return common.GetEnvOrDefaultBool(metadataAutoSyncEnabledEnv, true)
}

func metadataAutoSyncInterval() time.Duration {
	minutes := common.GetEnvOrDefault(metadataAutoSyncIntervalEnv, 24*60)
	if minutes < 1 {
		minutes = 24 * 60
	}
	return time.Duration(minutes) * time.Minute
}

func metadataAutoSyncLocale() string {
	locale, valid := normalizeLocale(common.GetEnvOrDefaultString(metadataAutoSyncLocaleEnv, metadataAutoSyncDefaultLocale))
	if !valid {
		return metadataAutoSyncDefaultLocale
	}
	return locale
}

// metadataVendorPrefixes links models the catalog does not document yet to the
// vendor that publishes them, so they still show a vendor and logo instead of
// the "missing metadata" badge. The vendor record itself still comes from the
// catalog's vendor list.
var metadataVendorPrefixes = []struct{ prefix, vendor string }{
	{"doubao-", "Volcengine Ark"},
	{"ark-", "Volcengine Ark"},
	{"deepseek-", "DeepSeek"},
	{"kimi-", "Moonshot AI"},
	{"glm-", "Z.AI"},
	{"minimax-", "MiniMax (minimax.io)"},
}

// fallbackMetadataValues returns vendor-only metadata for a model the catalog
// does not describe. An unrecognized prefix, or a vendor the catalog does not
// list, leaves the model unresolved.
func fallbackMetadataValues(name string, upstreamVendors map[string]model.Vendor) (model.MetadataValues, bool) {
	key := strings.ToLower(strings.TrimSpace(name))
	for _, rule := range metadataVendorPrefixes {
		if !strings.HasPrefix(key, rule.prefix) {
			continue
		}
		if _, ok := upstreamVendors[rule.vendor]; !ok {
			return model.MetadataValues{}, false
		}
		return model.MetadataValues{Vendor: rule.vendor, NameRule: model.NameRuleExact, Status: 1}, true
	}
	return model.MetadataValues{}, false
}

type modelMetadataAutoSyncSummary struct {
	CheckedModels    int      `json:"checked_models"`
	CreatedModels    []string `json:"created_models"`
	UpdatedModels    []string `json:"updated_models"`
	CreatedVendors   []string `json:"created_vendors"`
	UnresolvedModels []string `json:"unresolved_models"`
}

// runModelMetadataAutoSyncOnce fills or refreshes metadata for every model the
// site serves (enabled channel models plus existing metadata records) from the
// upstream catalog. Models whose "allow metadata sync" switch is off and models
// the catalog does not document are left untouched.
func runModelMetadataAutoSyncOnce(ctx context.Context, locale string) (modelMetadataAutoSyncSummary, error) {
	summary := modelMetadataAutoSyncSummary{CreatedModels: []string{}, UpdatedModels: []string{}, CreatedVendors: []string{}, UnresolvedModels: []string{}}
	_, upstream, upstreamVendors, err := fetchMetadataCatalog(ctx, locale)
	if err != nil {
		return summary, err
	}
	resolver := newMetadataResolver(upstream)
	// A single conflict means an admin edited metadata between planning and
	// applying; re-planning against fresh state resolves it.
	for attempt := range 2 {
		plan, updates, err := planModelMetadataAutoSync(resolver, upstreamVendors)
		if err != nil {
			return summary, err
		}
		if len(updates) == 0 {
			return plan, nil
		}
		result, err := model.ApplyMetadataSync(updates, upstreamVendors)
		if err != nil {
			if errors.Is(err, model.ErrMetadataSyncConflict) && attempt == 0 {
				continue
			}
			return plan, err
		}
		plan.CreatedVendors = result.CreatedVendors
		plan.UpdatedModels = make([]string, 0, len(result.UpdatedModels))
		for _, updated := range result.UpdatedModels {
			plan.UpdatedModels = append(plan.UpdatedModels, updated.ModelName)
		}
		return plan, nil
	}
	return summary, model.ErrMetadataSyncConflict
}

// planModelMetadataAutoSync reads the current site state and returns the
// metadata updates the catalog implies. The returned summary describes the plan
// even when the caller ends up not applying it.
func planModelMetadataAutoSync(resolver metadataResolver, upstreamVendors map[string]model.Vendor) (modelMetadataAutoSyncSummary, []model.MetadataSyncUpdate, error) {
	summary := modelMetadataAutoSyncSummary{CreatedModels: []string{}, UpdatedModels: []string{}, CreatedVendors: []string{}, UnresolvedModels: []string{}}
	locals, vendors, err := model.GetMetadataSyncState(model.DB)
	if err != nil {
		return summary, nil, err
	}
	missing, err := model.GetMissingModels()
	if err != nil {
		return summary, nil, err
	}
	targets := make(map[string]struct{}, len(locals)+len(missing))
	for name := range locals {
		targets[name] = struct{}{}
	}
	for _, name := range missing {
		targets[name] = struct{}{}
	}
	names := make([]string, 0, len(targets))
	for name := range targets {
		names = append(names, name)
	}
	sort.Strings(names)

	vendorByID := make(map[int]*model.Vendor, len(vendors))
	for _, vendor := range vendors {
		vendorByID[vendor.Id] = vendor
	}
	updates := make([]model.MetadataSyncUpdate, 0, len(names))
	for _, name := range names {
		summary.CheckedModels++
		local := locals[name]
		values, found := resolver.resolve(name)
		// The vendor-only fallback only seeds a record for a model the catalog
		// does not document. Once a record exists the admin owns it, so later
		// manual edits are never overwritten.
		if !found && local == nil {
			values, found = fallbackMetadataValues(name, upstreamVendors)
		}
		if !found {
			if local == nil {
				summary.UnresolvedModels = append(summary.UnresolvedModels, name)
			}
			continue
		}
		if local != nil && local.SyncOfficial == 0 {
			continue
		}
		var localVendor *model.Vendor
		if local != nil {
			localVendor = vendorByID[local.VendorID]
		}
		selection := model.MetadataSyncSelection{
			ModelName:     name,
			RecordVersion: model.MetadataRecordVersion(local, localVendor, model.FindMetadataVendor(vendors, values.Vendor)),
			Create:        local == nil,
		}
		if local == nil {
			summary.CreatedModels = append(summary.CreatedModels, name)
		} else {
			selection.Fields = metadataFieldDiff(local, localVendor, values)
			if len(selection.Fields) == 0 {
				continue
			}
			summary.UpdatedModels = append(summary.UpdatedModels, name)
		}
		updates = append(updates, model.MetadataSyncUpdate{MetadataSyncSelection: selection, Values: values})
	}
	return summary, updates, nil
}
