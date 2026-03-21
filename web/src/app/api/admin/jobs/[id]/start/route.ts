import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job 不存在" }, { status: 404 });
  if (job.status !== "claimed") {
    return NextResponse.json(
      { error: "invalid_status_transition", message: `当前状态为 ${job.status}，只有 claimed 可开始` },
      { status: 409 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const j = await tx.job.update({
      where: { id },
      data: { status: "running", startedAt: new Date() },
    });
    await tx.discoveryRequest.update({
      where: { id: j.discoveryRequestId },
      data: { status: "running" },
    });
    return j;
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    startedAt: updated.startedAt,
  });
}
