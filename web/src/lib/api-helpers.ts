import { NextResponse } from "next/server";
import { getSession } from "./auth";
import { prisma } from "./prisma";

export const STATUS_TEXT: Record<string, string> = {
  queued: "等待处理",
  claimed: "任务已接收，准备开始",
  running: "正在整理目标客户",
  awaiting_review: "结果已生成，正在准备发布",
  published: "结果已可查看",
  failed: "本轮处理未完成",
  cancelled: "任务已取消",
};

export const FEEDBACK_ACTION_TO_LEAD_STATUS: Record<string, string> = {
  interested: "interested",
  not_fit: "dismissed",
  contacted: "contacted",
};

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user || user.status === "disabled") return null;
  return user;
}
