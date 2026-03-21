"""
Per-user workspace isolation for OpenClaw data.

Directory layout:
  {OPENCLAW_ROOT}/
  ├── workflow/                     # shared scripts (all users)
  └── users/
      └── {phone}/                  # per-user workspace
          ├── company_master.tsv
          ├── company_profile.tsv
          ├── review_queue.tsv
          ├── platform_master.tsv
          ├── platform_exploration_state.json
          ├── platform_bucket_registry.json
          └── runs/
"""

import json
import os
from pathlib import Path

OPENCLAW_ROOT = Path(os.environ.get(
    "OPENCLAW_WORKSPACE",
    Path.home() / ".openclaw" / "workspace",
))

WORKFLOW_DIR = OPENCLAW_ROOT / "workflow"

# Sentinel to avoid re-initializing on every call within a single process
_initialized_users: set[str] = set()

# TSV files that need a proper header row (empty content, but with schema)
_TSV_HEADERS: dict[str, str] = {
    "company_master.tsv": (
        "root_domain\tcompany_name_best\tbest_entry_url\tsource_type\tsource_platform_domain\t"
        "region_hint\tcategory_hint\tfirst_seen_at\tlast_seen_at\tlast_verified_at\t"
        "company_status\tverification_level\ttotal_score\tpriority\tseen_count\tsource_count\t"
        "risk_flags\tnotes\tprocessing_count\tlast_processed_at\tfinal_outcome\t"
        "discovery_run_id\tprofile_status\tprofile_quality\tprofile_last_updated_at\t"
        "email_best\tphone_best\tcountry\tcompany_role\tbusiness_model\t"
        "product_categories\tbuyer_fit\timport_signal\toem_odm_signal"
    ),
    "review_queue.tsv": (
        "source_url\troot_domain\tcompany_name\tbest_entry_url\t"
        "queue_reason\treview_status\tcreated_at\trun_id"
    ),
    "company_profile.tsv": (
        "root_domain\tcompany_name\tbest_entry_url\tprofile_status\tprofile_quality\t"
        "profile_run_id\tprofile_version\tprofile_first_built_at\tprofile_last_updated_at\t"
        "email_best\temail_alt\tphone_best\tphone_alt\tcontact_page_url\tcontact_form_url\t"
        "linkedin_company_url\tcountry\tstate_region\tcity\taddress_raw\tfounded_year\t"
        "business_model\tcompany_role\tbuyer_fit\tbuyer_fit_reason\tproduct_categories\t"
        "core_products\ttarget_markets\tindustry_focus\timport_signal\toem_odm_signal\t"
        "private_label_signal\tvendor_onboarding_signal\tmoq_sample_signal\t"
        "procurement_signal_notes\temployee_range\trevenue_range\tfacility_signal\t"
        "certifications\tevidence_urls\tevidence_notes\tpages_visited_count"
    ),
    "run_history.tsv": (
        "run_id\tcollected_at\ttarget_region\ttarget_category\tlanguage_hint\t"
        "max_platforms\tmax_total_companies\texplore_ratio\tcandidates_rows\t"
        "company_leads\tplatform_leads\treview_queue_rows\tfinal_leads_rows\t"
        "fully_verified\tpartially_verified\tP1\tP2\tmain_pool_rows\t"
        "observation_pool_rows\trejected_pool_rows\tplatform_master_rows\t"
        "platform_total_yield\tcompany_master_rows"
    ),
    "run_history_company.tsv": (
        "run_id\tcollected_at\truntime_mode\ttarget_region\ttarget_category\t"
        "drilldown_platforms_count\tdrilldown_ok_count\tdrilldown_failed_count\t"
        "companies_extracted\tcompanies_new\tcompanies_existing\t"
        "company_master_before_rows\tcompany_master_after_rows\textract_ok_count\t"
        "review_queue_rows\tlog_file\ttrace_file"
    ),
    "run_history_platform.tsv": (
        "run_id\tcollected_at\truntime_mode\trequested_mode\tauto_decision\t"
        "target_region\ttarget_category\tplatform_rows\tunique_platform_domains\t"
        "new_platform_domains\texisting_platform_domains_seen\t"
        "platform_master_before_rows\tplatform_master_after_rows\t"
        "maintenance_targets_checked\tmaintenance_ok_count\tmaintenance_blocked_count\t"
        "type_counts\tscale_counts\tstatus_counts\tlog_file\ttrace_file"
    ),
}

_PLATFORM_MASTER_HEADER = (
    "platform_domain\tplatform_name\tentry_url\tplatform_type\tregion_hint\t"
    "category_hint\tfirst_seen_at\tlast_seen_at\tlast_crawled_at\tcrawl_status\t"
    "platform_scale\tscale_score\tscale_signals\tdrill_strategy\t"
    "yield_company_count\tyield_total_companies_seen\tblock_reason\tstale_days\t"
    "priority_score\tsource_count\tnotes\tyield_to_main_pool\tyield_to_observation\t"
    "yield_rejected\tavg_lead_score\tquality_tier\tdrill_roi\tlast_drill_at\t"
    "drill_attempts\tsaturation_signal\tcoverage_tier\tlifecycle_status\t"
    "validation_status\tbucket_type\tbucket_sub_category\tbucket_region\t"
    "bucket_buyer_angle\ttotal_discovery_runs\tconsecutive_zero_yield\t"
    "last_bucket_selected_at\tlifecycle_changed_at"
)


def _init_workspace(ws: Path, phone: str) -> None:
    """Initialize a new user workspace with required files.

    Each user gets a completely clean workspace — no data copied from
    other users, so OpenClaw explores fresh for this user's categories."""
    (ws / "runs").mkdir(parents=True, exist_ok=True)

    # TSV files: header-only (no data rows)
    for filename, header in _TSV_HEADERS.items():
        path = ws / filename
        if not path.exists() or path.stat().st_size == 0:
            path.write_text(header + "\n", encoding="utf-8")

    # platform_master.tsv: also header-only
    pm_path = ws / "platform_master.tsv"
    if not pm_path.exists() or pm_path.stat().st_size == 0:
        pm_path.write_text(_PLATFORM_MASTER_HEADER + "\n", encoding="utf-8")

    # platform_bucket_registry.json: empty registry
    reg_path = ws / "platform_bucket_registry.json"
    if not reg_path.exists() or reg_path.stat().st_size == 0:
        reg_path.write_text(
            json.dumps({"buckets": []}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    # platform_exploration_state.json: fresh state
    state_path = ws / "platform_exploration_state.json"
    if not state_path.exists() or state_path.stat().st_size == 0:
        state_path.write_text(
            json.dumps({
                "last_updated": "",
                "total_runs": 0,
                "buckets_explored": [],
            }, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        _initialized_users.add(phone)
    print(f"  [workspace] 初始化用户工作空间: {ws}")


# ── Dynamic bucket registry generation ───────────────────────

_GENERIC_TYPE_BUCKETS = [
    "association", "directory", "exhibitor_list", "marketplace",
    "supplier_resource", "brand_directory", "vendor_list", "member_list",
]

_GENERIC_REGION_BUCKETS = {
    "美国": ["USA national", "California", "Texas", "Florida", "Midwest",
             "Southeast", "New York", "Pacific Northwest", "Northeast", "Southwest"],
    "英国": ["UK national", "London", "Manchester", "Birmingham", "Scotland", "Wales"],
    "德国": ["Germany national", "Bavaria", "NRW", "Berlin", "Hamburg"],
    "日本": ["Japan national", "Tokyo", "Osaka", "Nagoya"],
}

_GENERIC_BUYER_ANGLE_BUCKETS = [
    "importer", "distributor", "wholesaler", "private label",
    "vendor onboarding", "sourcing", "procurement", "trade buyer",
]

_CATEGORY_SUB_BUCKETS: dict[str, list[str]] = {
    "宠物用品": [
        "pet grooming", "pet toys", "pet treats", "pet apparel",
        "pet bedding", "pet travel", "pet food", "pet health supplements",
        "pet furniture", "pet tech", "bird supplies", "aquarium supplies",
    ],
    "消费电子": [
        "audio equipment", "smart home devices", "wearable technology",
        "computer peripherals", "mobile accessories", "gaming accessories",
        "power banks & chargers", "smart watches", "earbuds & headphones",
        "home appliances", "LED lighting", "security cameras",
    ],
    "服装": [
        "casual wear", "sportswear", "outerwear", "underwear",
        "children clothing", "workwear", "fashion accessories",
        "footwear", "swimwear", "knitwear", "denim", "formal wear",
    ],
    "家居用品": [
        "kitchen tools", "bedding", "bathroom accessories", "storage solutions",
        "home decor", "cleaning products", "garden tools", "tableware",
        "candles & fragrance", "curtains & textiles", "furniture hardware",
    ],
    "美妆个护": [
        "skincare", "haircare", "makeup", "nail care", "oral care",
        "fragrances", "body care", "men grooming", "beauty tools",
        "organic cosmetics", "sun care", "anti-aging",
    ],
    "家具家装": [
        "furniture wholesale", "home furnishings", "cabinetry",
        "lighting fixtures", "home improvement", "contract furniture",
        "office furniture", "outdoor furniture", "upholstery",
        "flooring", "bathroom fixtures", "kitchen cabinets",
    ],
}

# Fallback: generate generic sub-buckets from the category name
def _generate_sub_buckets(category: str) -> list[str]:
    if category in _CATEGORY_SUB_BUCKETS:
        return _CATEGORY_SUB_BUCKETS[category]
    return [
        f"{category} accessories", f"{category} components",
        f"{category} wholesale", f"{category} OEM",
        f"{category} retail", f"{category} B2B",
    ]


def ensure_bucket_registry(phone: str, target_category: str, target_region: str) -> None:
    """Generate or update the platform_bucket_registry.json for a user's workspace.

    Called before executing an OpenClaw workflow to ensure proper bucket
    definitions exist for the given category/region combination."""
    ws = user_workspace(phone)
    reg_path = ws / "platform_bucket_registry.json"

    # Only regenerate if empty or different target_category
    if reg_path.exists() and reg_path.stat().st_size > 100:
        try:
            existing = json.loads(reg_path.read_text(encoding="utf-8"))
            if existing.get("target_category") == target_category and len(existing.get("type_buckets", [])) > 0:
                return  # already configured for this category
        except (json.JSONDecodeError, KeyError):
            pass

    region_buckets = _GENERIC_REGION_BUCKETS.get(target_region, [f"{target_region} national"])
    sub_buckets = _generate_sub_buckets(target_category)

    registry = {
        "schema_version": 1,
        "target_category": target_category,
        "target_region": target_region,
        "description": f"Exploration bucket definitions for {target_category} platform discovery",
        "type_buckets": _GENERIC_TYPE_BUCKETS,
        "sub_category_buckets": sub_buckets,
        "region_buckets": region_buckets,
        "buyer_angle_buckets": _GENERIC_BUYER_ANGLE_BUCKETS,
    }

    reg_path.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"  [workspace] 生成 bucket 注册表: category={target_category} region={target_region}")


def user_workspace(phone: str) -> Path:
    """Return the isolated workspace for a given user (by phone).
    Automatically initializes the workspace on first access."""
    ws = OPENCLAW_ROOT / "users" / phone
    if phone not in _initialized_users:
        _init_workspace(ws, phone)
    return ws


def user_profile_tsv(phone: str) -> Path:
    return user_workspace(phone) / "company_profile.tsv"


def user_company_master_tsv(phone: str) -> Path:
    return user_workspace(phone) / "company_master.tsv"


def user_review_queue_tsv(phone: str) -> Path:
    return user_workspace(phone) / "review_queue.tsv"
