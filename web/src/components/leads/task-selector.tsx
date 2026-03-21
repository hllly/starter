"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUS_SHORT: Record<string, string> = {
  published: "已完成",
  failed: "未完成",
  cancelled: "已取消",
  queued: "等待中",
  claimed: "已接收",
  running: "处理中",
  awaiting_review: "待发布",
};

interface Task {
  id: string;
  productCategory: string;
  status: string;
  createdAt: string;
}

export function TaskSelector({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (tasks.length <= 1) return null;

  const selected = tasks.find((t) => t.id === selectedId);

  return (
    <Select value={selectedId ?? undefined} onValueChange={onSelect}>
      <SelectTrigger className="w-72">
        <SelectValue placeholder="选择任务">
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="truncate">{selected.productCategory}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(selected.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </span>
          ) : (
            "选择任务"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {tasks.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            <span className="flex items-center gap-2">
              <span className="truncate">{t.productCategory}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {STATUS_SHORT[t.status] ?? t.status}
              </Badge>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(t.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
