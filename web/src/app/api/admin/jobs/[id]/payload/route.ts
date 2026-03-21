import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      discoveryRequest: {
        include: { user: { select: { id: true, phone: true, name: true, email: true } } },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job 不存在" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    requestId: job.discoveryRequestId,
    status: job.status,
    request: {
      productCategory: job.discoveryRequest.productCategory,
      targetRegions: job.discoveryRequest.targetRegions,
      buyerTypes: job.discoveryRequest.buyerTypes,
      priorityDirection: job.discoveryRequest.priorityDirection,
      advancedOptions: job.discoveryRequest.advancedOptions,
    },
    user: {
      id: job.discoveryRequest.user.id,
      phone: job.discoveryRequest.user.phone,
      name: job.discoveryRequest.user.name,
      email: job.discoveryRequest.user.email,
    },
    userPhone: job.discoveryRequest.user.phone,
  });
}
