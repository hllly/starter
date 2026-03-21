import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError } from "@/lib/api-helpers";
import type { LeadStatus } from "@/generated/prisma/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const { id } = await params;

  const request = await prisma.discoveryRequest.findUnique({ where: { id } });
  if (!request || request.userId !== user.id) {
    return apiError("任务不存在", 404);
  }
  if (request.status !== "published") {
    return apiError("任务尚未发布，无法查看线索", 403);
  }

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") as LeadStatus | null;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));

  const where: Record<string, unknown> = { discoveryRequestId: id };
  if (statusFilter) where.status = statusFilter;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ currentTier: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { company: true },
    }),
    prisma.lead.count({ where }),
  ]);

  const companyIds = leads.map((l) => l.companyId);
  const previousLeads = companyIds.length
    ? await prisma.lead.findMany({
        where: {
          companyId: { in: companyIds },
          discoveryRequestId: { not: id },
        },
        select: {
          companyId: true,
          discoveryRequestId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const prevMap = new Map<string, typeof previousLeads>();
  for (const p of previousLeads) {
    if (!prevMap.has(p.companyId)) prevMap.set(p.companyId, []);
    prevMap.get(p.companyId)!.push(p);
  }

  return NextResponse.json({
    data: leads.map((lead) => {
      const prev = prevMap.get(lead.companyId) || [];
      return {
        id: lead.id,
        company: {
          id: lead.company.id,
          companyName: lead.company.companyName,
          website: lead.company.website,
          countryRegion: lead.company.countryRegion,
          linkedinUrl: lead.company.linkedinUrl,
          contactEmail: lead.company.contactEmail,
          contactPhone: lead.company.contactPhone,
        },
        sourceType: lead.sourceType,
        sourcePlatform: lead.sourcePlatform,
        sourceUrl: lead.sourceUrl,
        buyerType: lead.buyerType,
        currentTier: lead.currentTier,
        recommendationReason: lead.recommendationReason,
        recommendedAction: lead.recommendedAction,
        status: lead.status,
        note: lead.note,
        previouslyDiscovered: prev.length > 0,
        previousDiscoveries: prev.slice(0, 3).map((p) => ({
          requestId: p.discoveryRequestId,
          createdAt: p.createdAt,
          leadStatus: p.status,
        })),
        createdAt: lead.createdAt,
      };
    }),
    total,
    page,
    limit,
  });
}
