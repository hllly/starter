import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const feedbacks = await prisma.leadFeedback.findMany({
    where: { userId: user.id },
    select: {
      action: true,
      reason: true,
      lead: {
        select: {
          sourcePlatform: true,
          sourceType: true,
          status: true,
        },
      },
    },
  });

  const batchFeedbacks = await prisma.batchFeedback.findMany({
    where: { userId: user.id },
    select: { helpfulness: true },
  });

  const overall = {
    total_leads_seen: feedbacks.length,
    interested_count: 0,
    not_fit_count: 0,
    contacted_count: 0,
    interested_rate: 0,
    not_fit_rate: 0,
  };
  const byPlatform: Record<string, { leads: number; interested: number; not_fit: number; interested_rate: number }> = {};
  const bySourceType: Record<string, { leads: number; interested: number; not_fit: number }> = {};
  const notFitReasons: Record<string, number> = {};

  for (const fb of feedbacks) {
    if (fb.action === "interested") overall.interested_count++;
    if (fb.action === "not_fit") overall.not_fit_count++;
    if (fb.action === "contacted") overall.contacted_count++;

    if (fb.action === "not_fit" && fb.reason) {
      notFitReasons[fb.reason] = (notFitReasons[fb.reason] ?? 0) + 1;
    }

    const platform = fb.lead.sourcePlatform ?? "unknown";
    if (!byPlatform[platform]) byPlatform[platform] = { leads: 0, interested: 0, not_fit: 0, interested_rate: 0 };
    byPlatform[platform].leads++;
    if (fb.action === "interested") byPlatform[platform].interested++;
    if (fb.action === "not_fit") byPlatform[platform].not_fit++;

    const sourceType = fb.lead.sourceType ?? "unknown";
    if (!bySourceType[sourceType]) bySourceType[sourceType] = { leads: 0, interested: 0, not_fit: 0 };
    bySourceType[sourceType].leads++;
    if (fb.action === "interested") bySourceType[sourceType].interested++;
    if (fb.action === "not_fit") bySourceType[sourceType].not_fit++;
  }

  const total = Math.max(overall.total_leads_seen, 1);
  overall.interested_rate = Math.round((overall.interested_count / total) * 1000) / 1000;
  overall.not_fit_rate = Math.round((overall.not_fit_count / total) * 1000) / 1000;

  for (const stats of Object.values(byPlatform)) {
    stats.interested_rate = Math.round((stats.interested / Math.max(stats.leads, 1)) * 1000) / 1000;
  }

  const batchHelp: Record<string, number> = { helpful: 0, neutral: 0, not_helpful: 0 };
  for (const bf of batchFeedbacks) {
    batchHelp[bf.helpfulness] = (batchHelp[bf.helpfulness] ?? 0) + 1;
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    user_phone: phone,
    overall,
    by_source_platform: byPlatform,
    by_source_type: bySourceType,
    not_fit_reasons: notFitReasons,
    batch_helpfulness: batchHelp,
  });
}
