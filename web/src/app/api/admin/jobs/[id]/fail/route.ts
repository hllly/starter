import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { failPayloadSchema } from "@/lib/validations/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job 不存在" }, { status: 404 });
  if (job.status !== "running") {
    return NextResponse.json(
      { error: "invalid_status_transition", message: `当前状态为 ${job.status}，只有 running 可标记失败` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = failPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const j = await tx.job.update({
      where: { id },
      data: {
        status: "failed",
        failureType: parsed.data.failureType as never,
        errorSummary: parsed.data.errorSummary,
      },
    });
    await tx.discoveryRequest.update({
      where: { id: j.discoveryRequestId },
      data: { status: "failed" },
    });
    return j;
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    failureType: updated.failureType,
  });
}
