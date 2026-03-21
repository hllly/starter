import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { JobStatus } from "@/generated/prisma/client";

const VALID_STATUSES: JobStatus[] = [
  "queued", "claimed", "running", "awaiting_review", "published", "failed", "cancelled",
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") as JobStatus | null;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "必须提供有效的 status 参数" },
      { status: 400 }
    );
  }

  const jobs = await prisma.job.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: {
      discoveryRequest: {
        include: { user: { select: { id: true, name: true, phone: true } } },
      },
    },
  });

  return NextResponse.json({
    data: jobs.map((j) => ({
      id: j.id,
      discoveryRequestId: j.discoveryRequestId,
      status: j.status,
      request: {
        productCategory: j.discoveryRequest.productCategory,
        targetRegions: j.discoveryRequest.targetRegions,
        buyerTypes: j.discoveryRequest.buyerTypes,
        priorityDirection: j.discoveryRequest.priorityDirection,
        advancedOptions: j.discoveryRequest.advancedOptions,
        userId: j.discoveryRequest.user.id,
        userName: j.discoveryRequest.user.name,
      },
      createdAt: j.createdAt,
    })),
  });
}
