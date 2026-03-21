"use client";

import { useRef, useState } from "react";
import {
  Globe,
  Mail,
  Phone,
  Linkedin,
  Layers,
  Calendar,
  Loader2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";

export interface PoolItem {
  id: string;
  companyId: string;
  company: {
    id: string;
    companyName: string;
    website: string | null;
    rootDomain: string | null;
    countryRegion: string | null;
    linkedinUrl: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  poolStatus: string;
  matchLevel: string;
  poolScore: number | null;
  rootDomain: string | null;
  companyRole: string | null;
  businessModel: string | null;
  buyerFit: string | null;
  buyerFitReason: string | null;
  productCategoriesSummary: string | null;
  targetMarketsSummary: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  appearCount: number;
  sourceCount: number;
  latestLeadStatus: string | null;
  profileStatus: string;
  profileQuality: string;
  profileLastUpdatedAt: string | null;
  topContactEmail: string | null;
  topContactPhone: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

const MATCH_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  high:    { label: "高匹配", bg: "#FDE8E8", text: "#C0392B" },
  medium:  { label: "中匹配", bg: "#FEF0E6", text: "#D35400" },
  low:     { label: "低匹配", bg: "#F3F1EC", text: "#7A6E60" },
  unknown: { label: "待评估", bg: "#F3F1EC", text: "#7A6E60" },
};

const POOL_STATUS_LABELS: Record<string, string> = {
  active: "活跃",
  watching: "观察中",
  following: "跟进中",
  archived: "已归档",
  excluded: "已排除",
};

const PROFILE_STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  not_started: { label: "未画像", bg: "#F3F1EC", text: "#7A6E60" },
  partial:     { label: "部分画像", bg: "#FEF0E6", text: "#D35400" },
  complete:    { label: "画像完成", bg: "#E4F6EE", text: "#0F7A5A" },
  failed:      { label: "画像失败", bg: "#FDE8E8", text: "#C0392B" },
};

const ROLE_LABELS: Record<string, string> = {
  importer: "进口商",
  distributor: "分销商",
  wholesaler: "批发商",
  brand_sourcing: "品牌采购",
  manufacturer: "制造商",
  retailer: "零售商",
  trading_company: "贸易公司",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  active: "#34A37A",
  watching: "#8FA8A1",
  following: "#7A9AC3",
  archived: "#B6A793",
  excluded: "#B6A793",
};

export function PoolCard({
  item,
  onViewDetail,
  onProfileRequested,
}: {
  item: PoolItem;
  onViewDetail: (item: PoolItem) => void;
  onProfileRequested?: (itemId: string) => void;
}) {
  const [buildingProfile, setBuildingProfile] = useState(false);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);
  const buildStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showBuildStatus(msg: string) {
    setBuildStatus(msg);
    if (buildStatusTimer.current) clearTimeout(buildStatusTimer.current);
    buildStatusTimer.current = setTimeout(() => setBuildStatus(null), 4000);
  }

  const match = MATCH_STYLES[item.matchLevel] ?? MATCH_STYLES.unknown;
  const poolStatusLabel = POOL_STATUS_LABELS[item.poolStatus] ?? item.poolStatus;
  const profileInfo = PROFILE_STATUS_LABELS[item.profileStatus] ?? PROFILE_STATUS_LABELS.not_started;
  const roleLabel = ROLE_LABELS[item.companyRole?.toLowerCase() ?? ""] ?? item.companyRole ?? "";
  const barColor = STATUS_BAR_COLORS[item.poolStatus] ?? "#8FA8A1";

  const email = item.topContactEmail || item.company.contactEmail;
  const phone = item.topContactPhone || item.company.contactPhone;
  const domain = item.rootDomain || item.company.rootDomain || item.company.website;

  return (
    <div
      className="relative overflow-hidden bg-white cursor-pointer group"
      style={{
        borderRadius: "22px",
        border: "1px solid #E7E3DA",
        boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
      }}
      onClick={() => onViewDetail(item)}
    >
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: "6px", backgroundColor: barColor }}
      />

      {/* ═══ LAYER 1: Primary Identity ═══ */}
      <div className="flex items-start justify-between gap-6 pl-7 pr-6 pt-6 pb-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              style={{
                fontSize: "16px",
                fontWeight: 700,
                lineHeight: "24px",
                padding: "6px 12px",
                borderRadius: "999px",
                backgroundColor: match.bg,
                color: match.text,
              }}
            >
              {match.label}
            </span>
            {roleLabel && (
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: "999px",
                  backgroundColor: "#EAF7F4",
                  color: "#166C57",
                }}
              >
                {roleLabel}
              </span>
            )}
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: "999px",
                backgroundColor: profileInfo.bg,
                color: profileInfo.text,
              }}
            >
              {profileInfo.label}
            </span>
          </div>

          <div className="flex items-baseline gap-3 flex-wrap">
            <h3
              style={{
                fontSize: "28px",
                fontWeight: 700,
                lineHeight: "36px",
                color: "#1C1C1A",
              }}
            >
              {item.company.companyName}
            </h3>
            {domain && (
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 shrink-0 hover:underline transition-colors"
                style={{ fontSize: "22px", fontWeight: 600, color: "#1A7F64" }}
                onClick={(e) => e.stopPropagation()}
              >
                <Globe className="h-4.5 w-4.5 shrink-0" />
                {domain}
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {item.company.countryRegion && (
              <span style={{ fontSize: "15px", fontWeight: 500, color: "#5B635E" }}>
                {item.company.countryRegion}
              </span>
            )}
            {item.company.countryRegion && item.productCategoriesSummary && (
              <span style={{ fontSize: "15px", color: "#5B635E" }}>|</span>
            )}
            {item.productCategoriesSummary && (
              <CategoryTags raw={item.productCategoriesSummary} />
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2 pt-1">
          {item.poolScore != null && (
            <span style={{ fontSize: "24px", fontWeight: 700, color: match.text }}>
              {item.poolScore}
              <span style={{ fontSize: "13px", fontWeight: 500, color: "#9A958E" }}> 分</span>
            </span>
          )}
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: "999px",
              backgroundColor: "#ECF2F0",
              color: "#47635C",
            }}
          >
            {poolStatusLabel}
          </span>
        </div>
      </div>

      {/* ═══ LAYER 2: Detail Blocks ═══ */}
      <div className="px-7 pb-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
          <FieldBlock title="联系方式">
            <div className="space-y-1.5 min-w-0">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  title={email}
                  className="flex items-center gap-1.5 min-w-0 transition-colors"
                  style={{ fontSize: "14px", fontWeight: 600, color: "#222521" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#222521")}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Mail className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="truncate">{email}</span>
                </a>
              ) : (
                <span className="flex items-center gap-1.5" style={{ fontSize: "14px", color: "#9A958E" }}>
                  <Mail className="h-4 w-4 shrink-0 opacity-30" /> 暂无邮箱
                </span>
              )}
              {phone ? (
                <span className="flex items-center gap-1.5 min-w-0" style={{ fontSize: "14px", fontWeight: 500, color: "#222521" }}>
                  <Phone className="h-4 w-4 shrink-0 opacity-50" />
                  <span className="truncate">{phone}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5" style={{ fontSize: "14px", color: "#9A958E" }}>
                  <Phone className="h-4 w-4 shrink-0 opacity-30" /> 暂无电话
                </span>
              )}
              {item.company.linkedinUrl && (
                <a
                  href={item.company.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-colors"
                  style={{ fontSize: "14px", fontWeight: 500, color: "#222521" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#222521")}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Linkedin className="h-4 w-4 shrink-0 opacity-50" /> LinkedIn
                </a>
              )}
            </div>
          </FieldBlock>

          <FieldBlock title="发现频次">
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5" style={{ fontSize: "16px", fontWeight: 600, color: "#222521" }}>
                <Layers className="h-4 w-4 shrink-0 opacity-50" />
                {item.appearCount} 次发现 · {item.sourceCount} 类来源
              </span>
              {item.firstSeenAt && (
                <span className="flex items-center gap-1.5" style={{ fontSize: "14px", color: "#9A958E" }}>
                  <Calendar className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  {new Date(item.firstSeenAt).toLocaleDateString("zh-CN")}
                  {item.lastSeenAt && item.lastSeenAt !== item.firstSeenAt && (
                    <> ~ {new Date(item.lastSeenAt).toLocaleDateString("zh-CN")}</>
                  )}
                </span>
              )}
            </div>
          </FieldBlock>

          <FieldBlock title="买家匹配">
            <div>
              <span style={{ fontSize: "16px", fontWeight: 600, color: "#222521" }}>
                {item.buyerFit
                  ? { high: "强匹配", medium: "中匹配", low: "弱匹配" }[item.buyerFit.toLowerCase()] ?? item.buyerFit
                  : "—"}
              </span>
              {item.buyerFitReason && (
                <p className="mt-1 line-clamp-2" style={{ fontSize: "13px", color: "#9A958E" }}>
                  {item.buyerFitReason}
                </p>
              )}
            </div>
          </FieldBlock>

          <FieldBlock title="商业模式">
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#222521" }}>
              {item.businessModel || "—"}
            </span>
          </FieldBlock>
        </div>
      </div>

      {/* ═══ LAYER 3: Action Area ═══ */}
      <div
        className="px-7 py-4 flex items-center justify-between"
        style={{ borderTop: "1px solid #E7E3DA" }}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ fontSize: "14px", color: "#6D6A63" }}>客户状态：</span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: "999px",
              backgroundColor: "#ECF2F0",
              color: "#47635C",
            }}
          >
            {poolStatusLabel}
          </span>
          {item.latestLeadStatus && (
            <span style={{ fontSize: "13px", color: "#9A958E" }}>
              · 最新线索：{item.latestLeadStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <BuildProfileBtn
            profileStatus={item.profileStatus}
            building={buildingProfile}
            buildStatus={buildStatus}
            onClick={async (e) => {
              e.stopPropagation();
              if (buildingProfile) return;
              setBuildingProfile(true);
              try {
                const res = await apiFetch<{ id?: string; status: string; message?: string }>(
                  `/api/customer-pool/${item.id}/build-profile`,
                  { method: "POST" }
                );
                if (res.id) {
                  // New request created (201)
                  showBuildStatus("请求已提交 ✓");
                  onProfileRequested?.(item.id);
                } else {
                  // In-flight or policy blocked (200 with message)
                  showBuildStatus(res.message ?? "已有进行中请求");
                }
              } catch (err: unknown) {
                const msg = (err as { message?: string })?.message;
                if (msg?.includes("429") || msg?.includes("每天")) {
                  showBuildStatus("今日已提交，明天再试");
                } else if (msg?.includes("409")) {
                  showBuildStatus("当前策略不允许重复请求");
                } else {
                  showBuildStatus("请求失败，请重试");
                }
              }
              setBuildingProfile(false);
            }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); onViewDetail(item); }}
            style={{
              fontSize: "16px",
              fontWeight: 600,
              borderRadius: "14px",
              height: "46px",
              padding: "0 18px",
              border: "1px solid #E7E3DA",
              color: "#4F5752",
              backgroundColor: "white",
              cursor: "pointer",
            }}
            className="hover:border-[#0F7A5A]/30 hover:text-[#0F7A5A] transition-colors"
          >
            查看详情
          </button>
        </div>
      </div>
    </div>
  );
}

function BuildProfileBtn({
  profileStatus,
  building,
  buildStatus,
  onClick,
}: {
  profileStatus: string;
  building: boolean;
  buildStatus: string | null;
  onClick: (e: React.MouseEvent) => void;
}) {
  const isComplete = profileStatus === "complete";

  // Show temporary feedback after submit (auto-clears after a few seconds via parent)
  if (buildStatus) {
    const isError = buildStatus.includes("失败") || buildStatus.includes("限制");
    return (
      <span
        style={{
          fontSize: "14px",
          fontWeight: 600,
          padding: "8px 14px",
          borderRadius: "12px",
          backgroundColor: isError ? "#FDE8E8" : "#E4F6EE",
          color: isError ? "#C0392B" : "#0F7A5A",
          display: "inline-block",
        }}
      >
        {buildStatus}
      </span>
    );
  }

  // Always allow clicking — backend policy controls whether request is accepted
  return (
    <button
      onClick={onClick}
      disabled={building}
      style={{
        fontSize: "14px",
        fontWeight: 600,
        padding: "8px 14px",
        borderRadius: "12px",
        border: "1px solid #0F7A5A",
        backgroundColor: isComplete ? "#E4F6EE" : "white",
        color: "#0F7A5A",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        cursor: building ? "default" : "pointer",
        opacity: building ? 0.6 : 1,
      }}
      className="hover:bg-[#E4F6EE] transition-colors"
    >
      {building && <Loader2 className="h-4 w-4 animate-spin" />}
      {isComplete ? "重新构建画像" : "构建深度画像"}
    </button>
  );
}

function FieldBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "#F7F5F0",
        border: "1px solid #ECE6DD",
        borderRadius: "16px",
        padding: "16px 18px",
        overflow: "hidden",
      }}
    >
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#6D6A63", marginBottom: "8px" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function CategoryTags({ raw }: { raw: string }) {
  const tags = raw
    .split(/[;,，、]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const MAX_SHOW = 4;
  const visible = tags.slice(0, MAX_SHOW);
  const extra = tags.length - MAX_SHOW;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((tag) => (
        <span
          key={tag}
          style={{
            fontSize: "13px",
            fontWeight: 600,
            padding: "4px 9px",
            borderRadius: "999px",
            backgroundColor: "#F3F1EB",
            color: "#665F54",
            whiteSpace: "nowrap",
          }}
        >
          {tag}
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            padding: "4px 9px",
            borderRadius: "999px",
            backgroundColor: "transparent",
            color: "#9A958E",
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
