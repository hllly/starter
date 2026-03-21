import { prisma } from "@/lib/prisma";
import type { MatchLevel } from "@/generated/prisma/client";

/**
 * Extract the root domain from a URL.
 * "https://www.phillipspet.com/about" → "phillipspet.com"
 */
export function extractRootDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const withProto = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(withProto);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Compute match level from buyer fit and pool score.
 * Priority: buyerFit > poolScore.
 */
export function computeMatchLevel(
  buyerFit: string | null | undefined,
  poolScore: number | null | undefined
): MatchLevel {
  if (buyerFit) {
    const lower = buyerFit.toLowerCase();
    if (lower === "high") return "high";
    if (lower === "medium") return "medium";
    if (lower === "low") return "low";
  }
  if (poolScore != null) {
    if (poolScore >= 80) return "high";
    if (poolScore >= 50) return "medium";
    return "low";
  }
  return "unknown";
}

/**
 * Recompute all lead-aggregated fields on a CustomerPoolItem from source data.
 * This is idempotent — calling it multiple times produces the same result.
 */
export async function recomputePoolItemFromLeads(
  userId: string,
  companyId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) {
  const db = tx ?? prisma;

  const leads = await db.lead.findMany({
    where: {
      companyId,
      discoveryRequest: { userId, status: "published" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      discoveryRequestId: true,
      status: true,
      sourceType: true,
      createdAt: true,
    },
  });

  const appearCount = leads.length;
  const latestLead = leads[0] ?? null;

  let firstSeenAt: Date | null = null;
  let lastSeenAt: Date | null = null;
  const sourceTypes = new Set<string>();

  for (const l of leads) {
    if (!firstSeenAt || l.createdAt < firstSeenAt) firstSeenAt = l.createdAt;
    if (!lastSeenAt || l.createdAt > lastSeenAt) lastSeenAt = l.createdAt;
    if (l.sourceType) sourceTypes.add(l.sourceType);
  }

  return {
    appearCount,
    sourceCount: sourceTypes.size,
    firstSeenAt,
    lastSeenAt,
    latestLeadId: latestLead?.id ?? null,
    latestRequestId: latestLead?.discoveryRequestId ?? null,
    latestLeadStatus: latestLead?.status ?? null,
  };
}

/**
 * Sync profile fields from CompanyProfile to CustomerPoolItem (覆盖写).
 */
export async function syncProfileToPoolItem(
  companyId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) {
  const db = tx ?? prisma;

  const profile = await db.companyProfile.findUnique({
    where: { companyId },
  });

  if (!profile) return null;

  return {
    profileStatus: profile.profileStatus,
    profileQuality: profile.profileQuality,
    profileLastUpdatedAt: profile.profileLastUpdatedAt,
    topContactEmail: profile.emailBest,
    topContactPhone: profile.phoneBest,
    companyRole: profile.companyRole,
    businessModel: profile.businessModel,
    buyerFit: profile.buyerFit,
    buyerFitReason: profile.buyerFitReason,
    productCategoriesSummary: profile.productCategories,
  };
}

/**
 * Full upsert of a CustomerPoolItem: recompute from leads, merge profile, compute matchLevel.
 */
export async function upsertPoolItem(
  userId: string,
  companyId: string,
  extra?: {
    poolScore?: number | null;
    firstSeenAt?: Date | null;
    lastSeenAt?: Date | null;
    sourceCount?: number | null;
    rootDomain?: string | null;
  },
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) {
  const db = tx ?? prisma;

  const leadAgg = await recomputePoolItemFromLeads(userId, companyId, tx);
  const profileFields = await syncProfileToPoolItem(companyId, tx);

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { rootDomain: true },
  });

  const rootDomain = extra?.rootDomain ?? company?.rootDomain ?? null;

  let firstSeenAt = leadAgg.firstSeenAt;
  if (extra?.firstSeenAt) {
    if (!firstSeenAt || extra.firstSeenAt < firstSeenAt) {
      firstSeenAt = extra.firstSeenAt;
    }
  }
  let lastSeenAt = leadAgg.lastSeenAt;
  if (extra?.lastSeenAt) {
    if (!lastSeenAt || extra.lastSeenAt > lastSeenAt) {
      lastSeenAt = extra.lastSeenAt;
    }
  }

  const poolScore = extra?.poolScore ?? undefined;
  const sourceCount = Math.max(
    leadAgg.sourceCount,
    extra?.sourceCount ?? 0
  );

  const buyerFit = profileFields?.buyerFit ?? null;
  const matchLevel = computeMatchLevel(buyerFit, poolScore ?? null);

  const data = {
    rootDomain,
    poolScore: poolScore ?? undefined,
    matchLevel,
    appearCount: leadAgg.appearCount,
    sourceCount,
    firstSeenAt,
    lastSeenAt,
    latestLeadId: leadAgg.latestLeadId,
    latestRequestId: leadAgg.latestRequestId,
    latestLeadStatus: leadAgg.latestLeadStatus,
    ...(profileFields ?? {}),
  };

  await db.customerPoolItem.upsert({
    where: {
      userId_companyId: { userId, companyId },
    },
    create: {
      userId,
      companyId,
      ...data,
    },
    update: data,
  });
}
