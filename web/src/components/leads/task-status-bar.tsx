"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface TaskDetail {
  status: string;
  statusText: string;
  resultSummary: {
    summaryText: string;
    recommendedCount: number;
    observationCount: number;
    sourceSummaryText: string;
    resultQuality: string;
  } | null;
  updatedAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  published: "default",
  failed: "destructive",
  cancelled: "outline",
};

export function TaskStatusBar({
  task,
  onRefresh,
}: {
  task: TaskDetail;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANT[task.status] ?? "secondary"}>
            {task.statusText}
          </Badge>
          <span className="text-xs text-muted-foreground">
            最近更新：{new Date(task.updatedAt).toLocaleString("zh-CN")}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 text-xs">
          <RefreshCw className="mr-1 h-3 w-3" />
          刷新
        </Button>
      </div>

      {task.resultSummary && (
        <div className="text-sm space-y-1">
          <p className="text-foreground">{task.resultSummary.summaryText}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>推荐 {task.resultSummary.recommendedCount} 条</span>
            <span>观察 {task.resultSummary.observationCount} 条</span>
            {task.resultSummary.sourceSummaryText && (
              <span>来源：{task.resultSummary.sourceSummaryText}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
