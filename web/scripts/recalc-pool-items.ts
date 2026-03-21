/**
 * Full recalculation of all customer_pool_items from source data.
 * Usage: npx tsx scripts/recalc-pool-items.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function computeMatchLevel(buyerFit: string | null, poolScore: number | null): "high" | "medium" | "low" | "unknown" {
  if (buyerFit) {
    const l = buyerFit.toLowerCase();
    if (l === "high") return "high";
    if (l === "medium") return "medium";
    if (l === "low") return "low";
  }
  if (poolScore != null) {
    if (poolScore >= 80) return "high";
    if (poolScore >= 50) return "medium";
    return "low";
  }
  return "unknown";
}

async function main() {
  const items = await prisma.customerPoolItem.findMany({
    select: { id: true, userId: true, companyId: true, poolScore: true },
  });

  console.log(`Recalculating ${items.length} pool items...`);
  let recalculated = 0;

  for (const item of items) {
    const leads = await prisma.lead.findMany({
      where: {
        companyId: item.companyId,
        discoveryRequest: { userId: item.userId, status: "published" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, discoveryRequestId: true, status: true, sourceType: true, createdAt: true },
    });

    const latestLead = leads[0] ?? null;
    const sourceTypes = new Set(leads.map((l) => l.sourceType).filter(Boolean));

    let firstSeenAt: Date | null = null;
    let lastSeenAt: Date | null = null;
    for (const l of leads) {
      if (!firstSeenAt || l.createdAt < firstSeenAt) firstSeenAt = l.createdAt;
      if (!lastSeenAt || l.createdAt > lastSeenAt) lastSeenAt = l.createdAt;
    }

    const company = await prisma.company.findUnique({
      where: { id: item.companyId },
      select: { rootDomain: true },
    });

    const profile = await prisma.companyProfile.findUnique({
      where: { companyId: item.companyId },
    });

    const buyerFit = profile?.buyerFit ?? null;
    const matchLevel = computeMatchLevel(buyerFit, item.poolScore);

    const data: Record<string, unknown> = {
      rootDomain: company?.rootDomain ?? null,
      appearCount: leads.length,
      sourceCount: sourceTypes.size,
      firstSeenAt,
      lastSeenAt,
      latestLeadId: latestLead?.id ?? null,
      latestRequestId: latestLead?.discoveryRequestId ?? null,
      latestLeadStatus: latestLead?.status ?? null,
      matchLevel,
    };

    if (profile) {
      data.profileStatus = profile.profileStatus;
      data.profileQuality = profile.profileQuality;
      data.profileLastUpdatedAt = profile.profileLastUpdatedAt;
      data.topContactEmail = profile.emailBest;
      data.topContactPhone = profile.phoneBest;
      data.companyRole = profile.companyRole;
      data.businessModel = profile.businessModel;
      data.buyerFit = profile.buyerFit;
      data.buyerFitReason = profile.buyerFitReason;
      data.productCategoriesSummary = profile.productCategories;
    }

    await prisma.customerPoolItem.update({
      where: { id: item.id },
      data,
    });
    recalculated++;
  }

  console.log(`Done. ${recalculated} items recalculated.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
