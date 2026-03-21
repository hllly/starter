"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { TaskSelector } from "@/components/leads/task-selector";
import { TaskStatusBar } from "@/components/leads/task-status-bar";
import { LeadsList } from "@/components/leads/leads-list";
import { BatchFeedbackBar } from "@/components/leads/batch-feedback-bar";

interface Task {
  id: string;
  productCategory: string;
  status: string;
  statusText: string;
  leadCount: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskDetail extends Task {
  targetRegions: string[];
  buyerTypes: string[];
  priorityDirection: string;
  resultSummary: {
    summaryText: string;
    recommendedCount: number;
    observationCount: number;
    sourceSummaryText: string;
    resultQuality: string;
  } | null;
}

export default function LeadsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    apiFetch<{ data: Task[] }>("/api/discovery-requests?limit=50")
      .then((res) => {
        setTasks(res.data);
        const published = res.data.find((t) => t.status === "published");
        setSelectedTaskId(published?.id ?? res.data[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedTaskId) return;
    try {
      const detail = await apiFetch<TaskDetail>(`/api/discovery-requests/${selectedTaskId}`);
      setTaskDetail(detail);
    } catch { /* ignore */ }
  }, [selectedTaskId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail, refreshKey]);

  useEffect(() => {
    if (!taskDetail) return;
    const pollingStatuses = ["queued", "claimed", "running", "awaiting_review"];
    if (!pollingStatuses.includes(taskDetail.status)) return;
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 15000);
    return () => clearInterval(interval);
  }, [taskDetail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        加载中…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-muted-foreground text-sm">还没有提交过发现任务</p>
        <a href="/discover" className="mt-2 text-sm text-primary hover:underline">去提交第一个任务</a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header: title + task selector */}
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1C1C1A" }}>线索</h1>
        <TaskSelector tasks={tasks} selectedId={selectedTaskId} onSelect={setSelectedTaskId} />
      </div>

      {taskDetail && (
        <>
          <TaskStatusBar
            task={taskDetail}
            onRefresh={() => setRefreshKey((k) => k + 1)}
          />

          {taskDetail.status === "published" ? (
            <>
              <LeadsList
                requestId={taskDetail.id}
                taskCategory={taskDetail.productCategory}
                refreshKey={refreshKey}
              />
              <BatchFeedbackBar requestId={taskDetail.id} />
            </>
          ) : (
            <div className="flex items-center justify-center h-40 rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                {taskDetail.statusText || taskDetail.status}
                {["queued", "claimed", "running", "awaiting_review"].includes(taskDetail.status) && (
                  <span className="ml-2 text-xs text-muted-foreground/60">自动刷新中…</span>
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
