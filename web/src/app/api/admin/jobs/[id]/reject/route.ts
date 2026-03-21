import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rejectPayloadSchema } from "@/lib/validations/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job 不存在" }, { status: 404 });
  if (job.status !== "awaiting_review") {
    return NextResponse.json(
      { error: "invalid_status_transition", message: `当前状态为 ${job.status}，只有 awaiting_review 可拒绝` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = rejectPayloadSchema.safeParse(body);
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
        reviewDecision: "rejected",
        failureType: parsed.data.failureType as never,
        reviewNote: parsed.data.reviewNote,
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
    reviewNote: updated.reviewNote,
  });
}
