import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireUser, apiError } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const url = new URL(req.url);
  const matchLevel = url.searchParams.get("matchLevel");
  const poolStatus = url.searchParams.get("poolStatus");
  const profileStatus = url.searchParams.get("profileStatus");
  const minAppearCount = url.searchParams.get("minAppearCount");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200"), 500);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const conditions: Prisma.CustomerPoolItemWhereInput = { userId: user.id };
  if (matchLevel) conditions.matchLevel = matchLevel as never;
  if (poolStatus) conditions.poolStatus = poolStatus as never;
  if (profileStatus) conditions.profileStatus = profileStatus as never;
  if (minAppearCount) conditions.appearCount = { gte: parseInt(minAppearCount) };

  const [items, total] = await Promise.all([
    prisma.customerPoolItem.findMany({
      where: conditions,
      include: {
        company: {
          select: {
            id: true,
            companyName: true,
            website: true,
            rootDomain: true,
            countryRegion: true,
            linkedinUrl: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
      },
      // matchLevel-aware sort: high→medium→low→unknown, then by poolScore, then by recency.
      // poolScore nulls last so unscored items don't float to top in DESC ordering.
      orderBy: [
        { poolScore: { sort: "desc", nulls: "last" } },
        { lastSeenAt: { sort: "desc", nulls: "last" } },
      ],
      take: limit,
      skip: offset,
    }),
    prisma.customerPoolItem.count({ where: conditions }),
  ]);

  // Secondary sort by matchLevel priority (within the fetched page).
  // For single-matchLevel tabs this is a no-op; for the "all" tab it refines ordering
  // when items on the same page have different levels but similar poolScore.
  const MATCH_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
  const sorted = [...items].sort(
    (a, b) => (MATCH_ORDER[a.matchLevel] ?? 9) - (MATCH_ORDER[b.matchLevel] ?? 9)
  );

  return NextResponse.json({
    data: sorted.map((item) => ({
      id: item.id,
      companyId: item.companyId,
      company: item.company,
      poolStatus: item.poolStatus,
      matchLevel: item.matchLevel,
      poolScore: item.poolScore,
      rootDomain: item.rootDomain,
      companyRole: item.companyRole,
      businessModel: item.businessModel,
      buyerFit: item.buyerFit,
      buyerFitReason: item.buyerFitReason,
      productCategoriesSummary: item.productCategoriesSummary,
      targetMarketsSummary: item.targetMarketsSummary,
      firstSeenAt: item.firstSeenAt,
      lastSeenAt: item.lastSeenAt,
      appearCount: item.appearCount,
      sourceCount: item.sourceCount,
      latestLeadStatus: item.latestLeadStatus,
      profileStatus: item.profileStatus,
      profileQuality: item.profileQuality,
      profileLastUpdatedAt: item.profileLastUpdatedAt,
      topContactEmail: item.topContactEmail,
      topContactPhone: item.topContactPhone,
      note: item.note,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    total,
    limit,
    offset,
  });
}
