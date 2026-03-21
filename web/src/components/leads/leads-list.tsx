"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import { LeadCard } from "./lead-card";

interface Company {
  id: string;
  companyName: string;
  website: string | null;
  countryRegion: string | null;
  linkedinUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface Lead {
  id: string;
  company: Company;
  sourceType: string | null;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  buyerType: string | null;
  currentTier: string;
  recommendationReason: string | null;
  recommendedAction: string | null;
  status: string;
  note: string | null;
  previouslyDiscovered: boolean;
  previousDiscoveries: { requestId: string; createdAt: string; leadStatus: string }[];
  createdAt: string;
}

const TABS = [
  { value: "all",        label: "全部",     bg: "#F7F6F2", tabBarBg: "#EEEDE8" },
  { value: "pending",    label: "待处理",   bg: "#F3F8F7", tabBarBg: "#E8EDEC" },
  { value: "interested", label: "已关注",   bg: "#EEF8F4", tabBarBg: "#E3EDE9" },
  { value: "contacted",  label: "已联系",   bg: "#F1F5FA", tabBarBg: "#E6EAF0" },
  { value: "dealing",    label: "交易中",   bg: "#F3F9F2", tabBarBg: "#E8EDE7" },
  { value: "archived",   label: "暂不跟进", bg: "#F6F3F0", tabBarBg: "#EBE8E5" },
];

const TAB_STATUSES: Record<string, string[]> = {
  all: [],
  pending: ["new"],
  interested: ["interested"],
  contacted: ["contacted", "following"],
  dealing: ["dealing"],
  archived: ["paused", "dismissed", "no_interest"],
};

interface OverviewStats {
  total: number;
  highValue: number;
  suggestContact: number;
  processed: number;
}

export function LeadsList({
  requestId,
  taskCategory,
  refreshKey,
}: {
  requestId: string;
  taskCategory?: string;
  refreshKey: number;
}) {
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);

  const activeTabConfig = TABS.find((t) => t.value === activeTab) ?? TABS[0];

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Lead[]; total: number }>(
        `/api/discovery-requests/${requestId}/leads?limit=200`
      );
      setAllLeads(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [requestId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const filteredLeads = useMemo(() => {
    const statuses = TAB_STATUSES[activeTab];
    const base = (!statuses || statuses.length === 0) ? allLeads : allLeads.filter((l) => statuses.includes(l.status));

    const valuePriority: Record<string, number> = {
      contact_now: 0, contact_if_fit: 1, observe: 2, contact_maybe: 3, deprioritize: 4,
    };
    const statusPriority: Record<string, number> = {
      new: 0, interested: 1, contacted: 2, following: 3, dealing: 4,
      paused: 5, dismissed: 6, no_interest: 7,
    };

    return [...base].sort((a, b) => {
      const va = valuePriority[a.recommendedAction ?? ""] ?? 9;
      const vb = valuePriority[b.recommendedAction ?? ""] ?? 9;
      if (va !== vb) return va - vb;
      const sa = statusPriority[a.status] ?? 9;
      const sb = statusPriority[b.status] ?? 9;
      return sa - sb;
    });
  }, [allLeads, activeTab]);

  const stats: OverviewStats = useMemo(() => {
    const suggestContactActions = new Set(["contact_now", "contact_if_fit"]);
    return {
      total: allLeads.length,
      highValue: allLeads.filter((l) => l.recommendedAction === "contact_now").length,
      suggestContact: allLeads.filter((l) => suggestContactActions.has(l.recommendedAction ?? "")).length,
      processed: allLeads.filter((l) => l.status !== "new").length,
    };
  }, [allLeads]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allLeads.length };
    for (const [tab, statuses] of Object.entries(TAB_STATUSES)) {
      if (tab === "all") continue;
      counts[tab] = allLeads.filter((l) => statuses.includes(l.status)).length;
    }
    return counts;
  }, [allLeads]);

  function updateLeadLocally(leadId: string, updates: Partial<Lead>) {
    setAllLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, ...updates } : l))
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12" style={{ fontSize: "14px", color: "#9A958E" }}>
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Overview Stats ── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="本轮线索" value={stats.total} />
        <StatCard label="高价值" value={stats.highValue} accent />
        <StatCard label="建议联系" value={stats.suggestContact} accent />
        <StatCard label="已处理" value={stats.processed} />
      </div>

      {/* ── Tab Bar ── */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto"
        style={{
          backgroundColor: activeTabConfig.tabBarBg,
          borderRadius: "20px",
          padding: "8px",
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.value === activeTab;
          const count = tabCounts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className="shrink-0 transition-all"
              style={{
                height: "48px",
                borderRadius: "999px",
                padding: "0 18px",
                fontSize: "16px",
                fontWeight: 600,
                backgroundColor: isActive ? "white" : "transparent",
                color: isActive ? "#1C1C1A" : "#4F5752",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                border: isActive ? "1px solid rgba(0,0,0,0.04)" : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="ml-1.5 inline-flex items-center justify-center"
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: isActive ? "#E7E3DA" : "rgba(0,0,0,0.06)",
                    color: isActive ? "#4F5752" : "#6D6A63",
                    borderRadius: "999px",
                    padding: "2px 7px",
                    minWidth: "22px",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Scene Container + Lead Cards ── */}
      <div
        style={{
          backgroundColor: activeTabConfig.bg,
          borderRadius: "24px",
          padding: "24px 24px 32px",
        }}
      >
        {filteredLeads.length === 0 ? (
          <div className="text-center py-16" style={{ fontSize: "14px", color: "#9A958E" }}>
            {activeTab === "all" ? "暂无线索" : "该分类下暂无线索"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                taskCategory={taskCategory}
                onUpdate={updateLeadLocally}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        height: "96px",
        borderRadius: "20px",
        backgroundColor: "white",
        border: "1px solid #E7E3DA",
      }}
    >
      <p
        className="tabular-nums"
        style={{
          fontSize: "32px",
          fontWeight: 600,
          color: accent ? "#0F7A5A" : "#1C1C1A",
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: "15px", color: "#9A958E", marginTop: "2px" }}>
        {label}
      </p>
    </div>
  );
}
