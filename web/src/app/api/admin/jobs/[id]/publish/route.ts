import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertPoolItem } from "@/lib/pool-sync";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job 不存在" }, { status: 404 });
  if (job.status !== "awaiting_review") {
    return NextResponse.json(
      { error: "invalid_status_transition", message: `当前状态为 ${job.status}，只有 awaiting_review 可发布` },
      { status: 409 }
    );
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const j = await tx.job.update({
        where: { id },
        data: {
          status: "published",
          publishedAt: new Date(),
          reviewDecision: "approved",
        },
      });
      await tx.discoveryRequest.update({
        where: { id: j.discoveryRequestId },
        data: { status: "published" },
      });
      return j;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String((err as Record<string, unknown>)?.type ?? err);
    console.error("[publish] transaction failed:", msg);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 503 });
  }

  const dr = await prisma.discoveryRequest.findUnique({
    where: { id: updated.discoveryRequestId },
    select: { userId: true },
  });
  if (dr) {
    const leads = await prisma.lead.findMany({
      where: { discoveryRequestId: updated.discoveryRequestId },
      select: { companyId: true },
    });
    const companyIds = [...new Set(leads.map((l) => l.companyId))];
    for (const companyId of companyIds) {
      try {
        await upsertPoolItem(dr.userId, companyId);
      } catch (e) {
        console.error(`Failed to sync pool item for company ${companyId}:`, e);
      }
    }
  }

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    publishedAt: updated.publishedAt,
  });
}
