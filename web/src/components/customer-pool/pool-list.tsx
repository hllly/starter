"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { PoolCard, type PoolItem } from "./pool-card";
import { PoolDrawer } from "./pool-drawer";

const PAGE_SIZE = 5;
const POLL_FAST_MS = 10_000; // 10s when builds are pending
const POLL_IDLE_MS = 60_000; // 60s background refresh

const TABS = [
  { value: "all",     label: "全部",   bg: "#F7F6F2", tabBarBg: "#EEEDE8" },
  { value: "high",    label: "高匹配", bg: "#FCF5F5", tabBarBg: "#F0E8E8" },
  { value: "medium",  label: "中匹配", bg: "#FBF6F1", tabBarBg: "#F0EBE5" },
  { value: "low",     label: "低匹配", bg: "#F3F8F7", tabBarBg: "#E8EDEC" },
  { value: "unknown", label: "待评估", bg: "#F6F3F0", tabBarBg: "#EBE8E5" },
];

interface Stats {
  total: number;
  byMatchLevel: Record<string, number>;
  withProfile: number;
  multiSeen: number;
}

type Filter = {
  matchLevel?: string;   // "high" | "medium" | "low" | "unknown"
  profileStatus?: string; // "with_profile" | "multi_seen"
};

export function PoolList() {
  const [items, setItems] = useState<PoolItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [activeFilter, setActiveFilter] = useState<Filter>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerItem, setDrawerItem] = useState<PoolItem | null>(null);

  const pendingBuildIds = useRef<Set<string>>(new Set());
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTabConfig = TABS.find((t) => t.value === activeTab) ?? TABS[0];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Stats ──────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const s = await apiFetch<Stats>("/api/customer-pool/stats");
      setStats(s);
    } catch { /* ignore */ }
  }, []);

  // ── Page data ──────────────────────────────────────────────────
  const loadPage = useCallback(
    async (tab: string, pg: number, filter: Filter = {}, silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((pg - 1) * PAGE_SIZE));
      if (tab !== "all") params.set("matchLevel", tab);
      if (filter.profileStatus === "with_profile") params.set("profileStatus", "complete");
      if (filter.profileStatus === "multi_seen") params.set("minAppearCount", "2");

      try {
        const res = await apiFetch<{ data: PoolItem[]; total: number }>(
          `/api/customer-pool?${params.toString()}`
        );
        setItems(res.data);
        setTotal(res.total);

        res.data.forEach((item) => {
          if (
            pendingBuildIds.current.has(item.id) &&
            (item.profileStatus === "complete" || item.profileStatus === "failed")
          ) {
            pendingBuildIds.current.delete(item.id);
          }
        });
      } catch { /* ignore */ }

      if (!silent) setLoading(false);
      else setRefreshing(false);
    },
    []
  );

  // ── Adaptive polling ───────────────────────────────────────────
  const activeTabRef = useRef(activeTab);
  const pageRef = useRef(page);
  const filterRef = useRef(activeFilter);
  activeTabRef.current = activeTab;
  pageRef.current = page;
  filterRef.current = activeFilter;

  const schedulePoll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    const delay = pendingBuildIds.current.size > 0 ? POLL_FAST_MS : POLL_IDLE_MS;
    pollTimer.current = setTimeout(async () => {
      await Promise.all([
        loadPage(activeTabRef.current, pageRef.current, filterRef.current, true),
        loadStats(),
      ]);
      schedulePoll();
    }, delay);
  }, [loadPage, loadStats]);

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    Promise.all([loadPage("all", 1), loadStats()]);
    schedulePoll();
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tab change ─────────────────────────────────────────────────
  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setPage(1);
    loadPage(tab, 1, activeFilter);
  }

  // ── Filter change (from stat cards) ────────────────────────────
  function handleFilterToggle(key: string) {
    const isActive = activeFilter.profileStatus === key;
    const next: Filter = isActive ? {} : { profileStatus: key };
    setActiveFilter(next);
    setActiveTab("all");
    setPage(1);
    loadPage("all", 1, next);
  }

  // ── Page change ────────────────────────────────────────────────
  function handlePageChange(pg: number) {
    setPage(pg);
    loadPage(activeTab, pg, activeFilter);
  }

  // ── Manual refresh ─────────────────────────────────────────────
  function handleRefresh() {
    Promise.all([loadPage(activeTab, page, activeFilter, true), loadStats()]);
  }

  // ── Render ─────────────────────────────────────────────────────
  const tabCounts: Record<string, number> = {
    all: stats?.total ?? 0,
    high: stats?.byMatchLevel.high ?? 0,
    medium: stats?.byMatchLevel.medium ?? 0,
    low: stats?.byMatchLevel.low ?? 0,
    unknown: stats?.byMatchLevel.unknown ?? 0,
  };

  return (
    <div className="space-y-5">
      {/* Overview Stats */}
      <div className="relative">
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="客户总数"
            value={stats?.total ?? 0}
            active={!activeFilter.profileStatus}
            onClick={() => { setActiveFilter({}); setActiveTab("all"); setPage(1); loadPage("all", 1); }}
          />
          <StatCard
            label="高匹配"
            value={stats?.byMatchLevel.high ?? 0}
            accent
            active={activeTab === "high" && !activeFilter.profileStatus}
            onClick={() => { setActiveFilter({}); handleTabChange("high"); }}
          />
          <StatCard
            label="已画像"
            value={stats?.withProfile ?? 0}
            active={activeFilter.profileStatus === "with_profile"}
            onClick={() => handleFilterToggle("with_profile")}
          />
          <StatCard
            label="多次发现"
            value={stats?.multiSeen ?? 0}
            active={activeFilter.profileStatus === "multi_seen"}
            onClick={() => handleFilterToggle("multi_seen")}
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="刷新列表"
          className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors hover:bg-black/5"
          style={{ color: refreshing ? "#B0ADA7" : "#9A958E" }}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tab Bar */}
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
              onClick={() => handleTabChange(tab.value)}
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

      {/* Scene Container + Cards */}
      <div
        style={{
          backgroundColor: activeTabConfig.bg,
          borderRadius: "24px",
          padding: "24px 24px 28px",
        }}
      >
        {loading ? (
          <div className="text-center py-16" style={{ fontSize: "14px", color: "#9A958E" }}>
            加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16" style={{ fontSize: "14px", color: "#9A958E" }}>
            {activeTab === "all" ? "客户池暂无数据" : "该分类下暂无客户"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {items.map((item) => (
              <PoolCard
                key={item.id}
                item={item}
                onViewDetail={setDrawerItem}
                onProfileRequested={(itemId) => {
                  pendingBuildIds.current.add(itemId);
                  schedulePoll();
                }}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && total > PAGE_SIZE && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onChange={handlePageChange}
          />
        )}
      </div>

      {/* Detail Drawer */}
      {drawerItem && (
        <PoolDrawer
          item={drawerItem}
          open={!!drawerItem}
          onClose={() => setDrawerItem(null)}
          onStatusChange={(itemId, newStatus) => {
            setItems((prev) =>
              prev.map((i) => (i.id === itemId ? { ...i, poolStatus: newStatus } : i))
            );
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent = false,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  accent?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center transition-all"
      style={{
        height: "96px",
        borderRadius: "20px",
        backgroundColor: active ? "#F0FAF6" : "white",
        border: active ? "2px solid #0F7A5A" : "1px solid #E7E3DA",
        cursor: "pointer",
        boxShadow: active ? "0 0 0 3px rgba(15,122,90,0.08)" : "none",
      }}
    >
      <p
        className="tabular-nums"
        style={{ fontSize: "32px", fontWeight: 600, color: accent ? "#C0392B" : "#1C1C1A" }}
      >
        {value}
      </p>
      <p style={{ fontSize: "15px", color: active ? "#0F7A5A" : "#9A958E", fontWeight: active ? 600 : 400, marginTop: "2px" }}>{label}</p>
    </button>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  // Generate page numbers to show: always show first, last, current ±1, with "…" gaps
  const pages: (number | "…")[] = [];
  const addPage = (n: number) => {
    if (!pages.includes(n) && n >= 1 && n <= totalPages) pages.push(n);
  };
  addPage(1);
  addPage(page - 1);
  addPage(page);
  addPage(page + 1);
  addPage(totalPages);

  const sorted = (pages as number[])
    .filter((p) => typeof p === "number")
    .sort((a, b) => a - b);

  const withGaps: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) withGaps.push("…");
    withGaps.push(p);
  });

  const btnBase: React.CSSProperties = {
    height: "36px",
    minWidth: "36px",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    border: "1px solid transparent",
    padding: "0 8px",
  };

  return (
    <div
      className="flex items-center justify-between mt-6 pt-5"
      style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
    >
      <span style={{ fontSize: "13px", color: "#9A958E" }}>
        共 {total} 条 · 第 {page}/{totalPages} 页
      </span>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          style={{
            ...btnBase,
            color: page === 1 ? "#C8C4BC" : "#4F5752",
            backgroundColor: page === 1 ? "transparent" : "white",
            border: page === 1 ? "1px solid transparent" : "1px solid #E7E3DA",
            cursor: page === 1 ? "default" : "pointer",
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {withGaps.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} style={{ ...btnBase, color: "#9A958E", cursor: "default" }}>
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              style={{
                ...btnBase,
                backgroundColor: p === page ? "#1C1C1A" : "white",
                color: p === page ? "white" : "#4F5752",
                border: p === page ? "1px solid #1C1C1A" : "1px solid #E7E3DA",
              }}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          style={{
            ...btnBase,
            color: page === totalPages ? "#C8C4BC" : "#4F5752",
            backgroundColor: page === totalPages ? "transparent" : "white",
            border: page === totalPages ? "1px solid transparent" : "1px solid #E7E3DA",
            cursor: page === totalPages ? "default" : "pointer",
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
