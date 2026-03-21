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
      resultSummary: true,
      discoveryRequest: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          leads: {
            take: 50,
            include: { company: true },
          },
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job 不存在" }, { status: 404 });
  }

  const totalLeads = await prisma.lead.count({
    where: { discoveryRequestId: job.discoveryRequestId },
  });

  const companiesCreated = job.resultSummary
    ? await prisma.company.count({
        where: {
          leads: { some: { discoveryRequestId: job.discoveryRequestId } },
        },
      })
    : 0;

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      runId: job.runId,
      claimedBy: job.claimedBy,
      startedAt: job.startedAt,
      reviewReadyAt: job.reviewReadyAt,
    },
    request: {
      id: job.discoveryRequest.id,
      productCategory: job.discoveryRequest.productCategory,
      targetRegions: job.discoveryRequest.targetRegions,
      buyerTypes: job.discoveryRequest.buyerTypes,
      priorityDirection: job.discoveryRequest.priorityDirection,
      advancedOptions: job.discoveryRequest.advancedOptions,
    },
    user: {
      id: job.discoveryRequest.user.id,
      name: job.discoveryRequest.user.name,
      email: job.discoveryRequest.user.email,
    },
    resultSummary: job.resultSummary
      ? {
          summaryText: job.resultSummary.summaryText,
          recommendedCount: job.resultSummary.recommendedCount,
          observationCount: job.resultSummary.observationCount,
          sourceSummaryText: job.resultSummary.sourceSummaryText,
          sourceSummaryJson: job.resultSummary.sourceSummaryJson,
          resultQuality: job.resultSummary.resultQuality,
        }
      : null,
    leadsPreview: job.discoveryRequest.leads.map((l) => ({
      id: l.id,
      companyName: l.company.companyName,
      website: l.company.website,
      countryRegion: l.company.countryRegion,
      buyerType: l.buyerType,
      currentTier: l.currentTier,
      recommendationReason: l.recommendationReason,
      recommendedAction: l.recommendedAction,
    })),
    stats: {
      totalLeads,
      companiesCreated,
    },
  });
}
