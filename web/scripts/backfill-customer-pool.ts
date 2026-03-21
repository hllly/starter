/**
 * Backfill customer_pool_items from published leads.
 * Usage: npx tsx scripts/backfill-customer-pool.ts
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
  const leads = await prisma.lead.findMany({
    where: { discoveryRequest: { status: "published" } },
    include: {
      discoveryRequest: { select: { userId: true } },
      company: { select: { id: true, rootDomain: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<string, typeof leads>();
  for (const l of leads) {
    const key = `${l.discoveryRequest.userId}:${l.companyId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  let created = 0;
  let updated = 0;

  for (const [, groupLeads] of groups) {
    const userId = groupLeads[0].discoveryRequest.userId;
    const companyId = groupLeads[0].companyId;
    const rootDomain = groupLeads[0].company.rootDomain;

    const sorted = [...groupLeads].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const latest = sorted[sorted.length - 1];
    const sourceTypes = new Set(groupLeads.map((l) => l.sourceType).filter(Boolean));

    const data = {
      rootDomain,
      appearCount: groupLeads.length,
      sourceCount: sourceTypes.size,
      firstSeenAt: sorted[0].createdAt,
      lastSeenAt: latest.createdAt,
      latestLeadId: latest.id,
      latestRequestId: latest.discoveryRequestId,
      latestLeadStatus: latest.status,
      matchLevel: computeMatchLevel(null, null) as "unknown",
    };

    const existing = await prisma.customerPoolItem.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (existing) {
      await prisma.customerPoolItem.update({
        where: { userId_companyId: { userId, companyId } },
        data,
      });
      updated++;
    } else {
      await prisma.customerPoolItem.create({
        data: { userId, companyId, ...data },
      });
      created++;
    }
  }

  console.log(`Done. ${created} created, ${updated} updated. Groups: ${groups.size}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
