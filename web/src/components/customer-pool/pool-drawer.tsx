"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Globe, Mail, Phone, Linkedin, Calendar, Layers,
  Building2, ShieldCheck, TrendingUp, Package, MapPin,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { PoolItem } from "./pool-card";

interface Profile {
  id: string;
  profileStatus: string;
  profileQuality: string;
  emailBest: string | null;
  phoneBest: string | null;
  contactPageUrl: string | null;
  country: string | null;
  city: string | null;
  businessModel: string | null;
  companyRole: string | null;
  buyerFit: string | null;
  buyerFitReason: string | null;
  productCategories: string | null;
  coreProducts: string | null;
  targetMarkets: string | null;
  industryFocus: string | null;
  importSignal: string | null;
  employeeRange: string | null;
  revenueRange: string | null;
  certifications: string | null;
  evidenceNotes: string | null;
  profileLastUpdatedAt: string | null;
}

interface FullDetail extends PoolItem {
  profile: Profile | null;
}

interface LeadSummary {
  id: string;
  sourceType: string | null;
  sourcePlatform: string | null;
  recommendationReason: string | null;
  status: string;
  createdAt: string;
  taskCategory: string;
}

const MATCH_LABELS: Record<string, string> = {
  high: "高匹配", medium: "中匹配", low: "低匹配", unknown: "待评估",
};

const STATUS_LABELS: Record<string, string> = {
  new: "待处理", interested: "已关注", dismissed: "已排除",
  contacted: "已联系", following: "跟进中", paused: "暂不跟进", no_interest: "无意向",
};

const SOURCE_LABELS: Record<string, string> = {
  industry_directory: "行业目录", association: "行业协会", customs_data: "海关数据",
  marketplace: "电商平台", exhibitor_list: "展会名录", company_website: "官网", other: "其他",
};

const POOL_STATUS_OPTIONS = [
  { value: "active", label: "活跃" },
  { value: "watching", label: "观察中" },
  { value: "following", label: "跟进中" },
  { value: "archived", label: "已归档" },
  { value: "excluded", label: "已排除" },
];

export function PoolDrawer({
  item,
  open,
  onClose,
  onStatusChange,
}: {
  item: PoolItem;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (itemId: string, newStatus: string) => void;
}) {
  const [detail, setDetail] = useState<FullDetail | null>(null);
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDetail = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const [d, l] = await Promise.all([
        apiFetch<FullDetail>(`/api/customer-pool/${item.id}`),
        apiFetch<{ data: LeadSummary[] }>(`/api/customer-pool/${item.id}/leads`),
      ]);
      setDetail(d);
      setLeads(l.data);
      return d;
    } catch {
      return null;
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [item.id]);

  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearTimeout(pollRef.current);
      return;
    }
    fetchDetail(true);

    // Poll every 8s while profile is not yet complete/failed
    function schedulePoll() {
      pollRef.current = setTimeout(async () => {
        const d = await fetchDetail(false);
        const status = d?.profileStatus ?? item.profileStatus;
        if (status !== "complete" && status !== "failed") {
          schedulePoll(); // keep polling until terminal state
        }
      }, 8_000);
    }

    // Only start polling if the profile isn't already in a terminal state
    if (item.profileStatus !== "complete" && item.profileStatus !== "failed") {
      schedulePoll();
    }

    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [item.id, item.profileStatus, open, fetchDetail]);

  if (!open) return null;

  const profile = detail?.profile;
  const email = profile?.emailBest || item.topContactEmail || item.company.contactEmail;
  const phone = profile?.phoneBest || item.topContactPhone || item.company.contactPhone;
  const domain = item.rootDomain || item.company.rootDomain || item.company.website;
  const currentStatus = detail?.poolStatus ?? item.poolStatus;

  async function handleStatusChange(newStatus: string) {
    setUpdatingStatus(true);
    try {
      await apiFetch(`/api/customer-pool/${item.id}/pool-status`, {
        method: "PATCH",
        body: JSON.stringify({ poolStatus: newStatus }),
      });
      if (detail) setDetail({ ...detail, poolStatus: newStatus });
      onStatusChange?.(item.id, newStatus);
    } catch { /* ignore */ }
    setUpdatingStatus(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 z-50 overflow-y-auto"
        style={{
          width: "580px",
          maxWidth: "100vw",
          backgroundColor: "#FAFAF8",
          borderLeft: "1px solid #E7E3DA",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.06)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{ backgroundColor: "#FAFAF8", borderBottom: "1px solid #E7E3DA" }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1C1C1A" }}>
            {item.company.companyName}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20" style={{ fontSize: "14px", color: "#9A958E" }}>加载中…</div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            {/* Pool Status Management */}
            <Section title="客户状态管理">
              <div className="flex items-center gap-2 flex-wrap">
                {POOL_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    disabled={updatingStatus || currentStatus === opt.value}
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      padding: "7px 14px",
                      borderRadius: "999px",
                      border: currentStatus === opt.value ? "2px solid #0F7A5A" : "1px solid #E7E3DA",
                      backgroundColor: currentStatus === opt.value ? "#E4F6EE" : "white",
                      color: currentStatus === opt.value ? "#0F7A5A" : "#4F5752",
                      cursor: currentStatus === opt.value ? "default" : "pointer",
                      opacity: updatingStatus ? 0.5 : 1,
                    }}
                    className={currentStatus === opt.value ? "" : "hover:border-[#0F7A5A]/40 transition-colors"}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* Company Identity */}
            <Section title="公司信息">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <MatchBadge level={item.matchLevel} />
                  {item.poolScore != null && (
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#4F5752" }}>
                      评分 {item.poolScore}
                    </span>
                  )}
                  {(profile?.companyRole || item.companyRole) && (
                    <span style={{ fontSize: "14px", color: "#5B635E" }}>
                      · {profile?.companyRole || item.companyRole}
                    </span>
                  )}
                </div>
                {domain && (
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 hover:underline"
                    style={{ fontSize: "16px", color: "#1A7F64" }}>
                    <Globe className="h-4 w-4" /> {domain}
                  </a>
                )}
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="地区" value={
                  [profile?.country || item.company.countryRegion, profile?.city].filter(Boolean).join(", ") || null
                } />
                <InfoRow icon={<Package className="h-4 w-4" />} label="产品" value={
                  profile?.productCategories || item.productCategoriesSummary
                } />
                <InfoRow icon={<Building2 className="h-4 w-4" />} label="商业模式" value={
                  profile?.businessModel || item.businessModel
                } />
                <InfoRow icon={<TrendingUp className="h-4 w-4" />} label="买家匹配" value={
                  profile?.buyerFit || item.buyerFit
                } />
                {(profile?.buyerFitReason || item.buyerFitReason) && (
                  <p style={{ fontSize: "13px", color: "#9A958E", paddingLeft: "28px" }}>
                    {profile?.buyerFitReason || item.buyerFitReason}
                  </p>
                )}
              </div>
            </Section>

            {/* Contact */}
            <Section title="联系方式">
              <div className="space-y-2">
                <ContactRow icon={<Mail className="h-4 w-4" />} value={email} href={email ? `mailto:${email}` : undefined} fallback="暂无邮箱" />
                <ContactRow icon={<Phone className="h-4 w-4" />} value={phone} fallback="暂无电话" />
                <ContactRow icon={<Linkedin className="h-4 w-4" />} value={item.company.linkedinUrl ? "LinkedIn" : null} href={item.company.linkedinUrl ?? undefined} fallback="暂无" />
                {profile?.contactPageUrl && (
                  <ContactRow icon={<Globe className="h-4 w-4" />} value="联系页面" href={profile.contactPageUrl} fallback="" />
                )}
              </div>
            </Section>

            {/* Profile Detail (only if profile exists) */}
            {profile && (
              <>
                <Section title="采购信号">
                  <div className="space-y-2">
                    <SignalRow label="进口信号" value={profile.importSignal} />
                    <SignalRow label="核心产品" value={profile.coreProducts} />
                    <SignalRow label="目标市场" value={profile.targetMarkets} />
                    <SignalRow label="行业聚焦" value={profile.industryFocus} />
                  </div>
                </Section>

                <Section title="公司规模">
                  <div className="space-y-2">
                    <InfoRow icon={<Building2 className="h-4 w-4" />} label="员工规模" value={profile.employeeRange} />
                    <InfoRow icon={<TrendingUp className="h-4 w-4" />} label="营收规模" value={profile.revenueRange} />
                    {profile.certifications && (
                      <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="认证" value={profile.certifications} />
                    )}
                  </div>
                </Section>

                {profile.evidenceNotes && (
                  <Section title="证据与备注">
                    <p style={{ fontSize: "14px", color: "#5B635E", lineHeight: "22px" }}>
                      {profile.evidenceNotes}
                    </p>
                  </Section>
                )}

                <div
                  className="flex items-center gap-2"
                  style={{ fontSize: "12px", color: "#9A958E", paddingTop: "4px" }}
                >
                  画像质量：{profile.profileQuality}
                  {profile.profileLastUpdatedAt && (
                    <> · 更新于 {new Date(profile.profileLastUpdatedAt).toLocaleDateString("zh-CN")}</>
                  )}
                </div>
              </>
            )}

            {/* Discovery History */}
            <Section title="发现记录">
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center gap-1.5" style={{ fontSize: "14px", color: "#222521" }}>
                  <Layers className="h-4 w-4 opacity-50" />
                  {item.appearCount} 次发现 · {item.sourceCount} 类来源
                </span>
                {item.firstSeenAt && (
                  <span className="flex items-center gap-1.5" style={{ fontSize: "13px", color: "#9A958E" }}>
                    <Calendar className="h-3.5 w-3.5 opacity-40" />
                    {new Date(item.firstSeenAt).toLocaleDateString("zh-CN")}
                    {item.lastSeenAt && item.lastSeenAt !== item.firstSeenAt && (
                      <> ~ {new Date(item.lastSeenAt).toLocaleDateString("zh-CN")}</>
                    )}
                  </span>
                )}
              </div>

              {leads.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#9A958E" }}>暂无关联线索</p>
              ) : (
                <div className="space-y-2">
                  {leads.map((l) => (
                    <div
                      key={l.id}
                      style={{
                        backgroundColor: "white",
                        border: "1px solid #ECE6DD",
                        borderRadius: "14px",
                        padding: "12px 14px",
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#222521" }}>
                          {l.taskCategory}
                        </span>
                        <span style={{ fontSize: "12px", color: "#9A958E" }}>
                          {new Date(l.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: "999px",
                            backgroundColor: "#ECF2F0",
                            color: "#47635C",
                          }}
                        >
                          {STATUS_LABELS[l.status] ?? l.status}
                        </span>
                        {l.sourceType && (
                          <span style={{ fontSize: "12px", color: "#9A958E" }}>
                            来源：{SOURCE_LABELS[l.sourceType] ?? l.sourceType}
                            {l.sourcePlatform ? ` · ${l.sourcePlatform}` : ""}
                          </span>
                        )}
                      </div>
                      {l.recommendationReason && (
                        <p className="mt-1 line-clamp-2" style={{ fontSize: "13px", color: "#6D6A63" }}>
                          {l.recommendationReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: 700,
          color: "#1C1C1A",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid #E7E3DA",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function MatchBadge({ level }: { level: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    high: { bg: "#FDE8E8", text: "#C0392B" },
    medium: { bg: "#FEF0E6", text: "#D35400" },
    low: { bg: "#F3F1EC", text: "#7A6E60" },
    unknown: { bg: "#F3F1EC", text: "#7A6E60" },
  };
  const s = styles[level] ?? styles.unknown;
  return (
    <span style={{
      fontSize: "14px", fontWeight: 700, padding: "5px 12px",
      borderRadius: "999px", backgroundColor: s.bg, color: s.text,
    }}>
      {MATCH_LABELS[level] ?? "待评估"}
    </span>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="opacity-40 mt-0.5 shrink-0">{icon}</span>
      <span style={{ fontSize: "14px", color: "#5B635E" }}>
        <span style={{ fontWeight: 600, color: "#4F5752" }}>{label}：</span>{value}
      </span>
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div
      style={{
        backgroundColor: "#F7F5F0",
        border: "1px solid #ECE6DD",
        borderRadius: "12px",
        padding: "10px 14px",
      }}
    >
      <span style={{ fontSize: "13px", fontWeight: 600, color: "#6D6A63" }}>{label}</span>
      <p style={{ fontSize: "14px", fontWeight: 500, color: "#222521", marginTop: "4px" }}>{value}</p>
    </div>
  );
}

function ContactRow({
  icon, value, href, fallback,
}: {
  icon: React.ReactNode; value: string | null; href?: string; fallback: string;
}) {
  if (!value) {
    return (
      <span className="flex items-center gap-1.5" style={{ fontSize: "14px", color: "#9A958E" }}>
        <span className="opacity-30">{icon}</span> {fallback}
      </span>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-colors"
        style={{ fontSize: "14px", fontWeight: 500, color: "#222521" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#222521")}>
        <span className="opacity-50">{icon}</span> {value}
      </a>
    );
  }
  return (
    <span className="flex items-center gap-1.5" style={{ fontSize: "14px", fontWeight: 500, color: "#222521" }}>
      <span className="opacity-50">{icon}</span> {value}
    </span>
  );
}
