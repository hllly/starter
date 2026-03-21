import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError, STATUS_TEXT } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const { id } = await params;

  const request = await prisma.discoveryRequest.findUnique({
    where: { id },
    include: {
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { resultSummary: true },
      },
      _count: { select: { leads: true } },
    },
  });

  if (!request || request.userId !== user.id) {
    return apiError("任务不存在", 404);
  }

  const job = request.jobs[0];
  const isPublished = request.status === "published";
  const summary = isPublished ? job?.resultSummary : null;

  return NextResponse.json({
    id: request.id,
    productCategory: request.productCategory,
    targetRegions: request.targetRegions,
    buyerTypes: request.buyerTypes,
    priorityDirection: request.priorityDirection,
    advancedOptions: request.advancedOptions,
    status: request.status,
    statusText: STATUS_TEXT[request.status] || request.status,
    resultSummary: summary
      ? {
          summaryText: summary.summaryText,
          recommendedCount: summary.recommendedCount,
          observationCount: summary.observationCount,
          sourceSummaryText: summary.sourceSummaryText,
          resultQuality: summary.resultQuality,
        }
      : null,
    leadCount: isPublished ? request._count.leads : null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  });
}
