/**
 * Import workflow company_master.tsv into customer_pool_items.
 * Usage: npx tsx scripts/import-workflow-company-master.ts --user-id <uuid> [--tsv <path>]
 */
import * as fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEFAULT_TSV = "/Users/hll/.openclaw/workspace/company_master.tsv";

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

function normalizeCompanyName(name: string): string {
  const SUFFIXES = ["inc", "llc", "ltd", "corp", "co", "corporation", "incorporated", "limited", "company", "gmbh", "ag", "sa", "srl", "bv", "nv", "pty", "pte", "plc"];
  const pattern = new RegExp(`\\b(${SUFFIXES.join("|")})\\.?\\s*$`, "i");
  return name.toLowerCase().trim().replace(/[.,\-_'"()&]/g, " ").replace(pattern, "").replace(/\s+/g, " ").trim();
}

function parseArgs(): { userId: string; tsvPath: string } {
  const args = process.argv.slice(2);
  let userId = "";
  let tsvPath = DEFAULT_TSV;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user-id" && args[i + 1]) { userId = args[++i]; }
    if (args[i] === "--tsv" && args[i + 1]) { tsvPath = args[++i]; }
  }
  if (!userId) {
    console.error("Error: --user-id <uuid> is required");
    process.exit(1);
  }
  return { userId, tsvPath };
}

interface TsvRow {
  root_domain: string;
  company_name_best: string;
  best_entry_url: string;
  source_type: string;
  region_hint: string;
  category_hint: string;
  first_seen_at: string;
  last_seen_at: string;
  total_score: string;
  source_count: string;
  profile_status: string;
  profile_quality: string;
  buyer_fit: string;
  company_role: string;
  business_model: string;
  product_categories: string;
  email_best: string;
  phone_best: string;
  country: string;
  [key: string]: string;
}

function parseTsv(path: string): TsvRow[] {
  const content = fs.readFileSync(path, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row as TsvRow;
  });
}

async function main() {
  const { userId, tsvPath } = parseArgs();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`Error: User ${userId} not found`);
    process.exit(1);
  }

  const rows = parseTsv(tsvPath);
  console.log(`Parsed ${rows.length} rows from ${tsvPath}`);

  let companiesCreated = 0;
  let companiesMatched = 0;
  let poolCreated = 0;
  let poolUpdated = 0;

  for (const row of rows) {
    if (!row.root_domain) continue;

    let company = await prisma.company.findFirst({
      where: { rootDomain: row.root_domain },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          companyName: row.company_name_best || row.root_domain,
          normalizedName: normalizeCompanyName(row.company_name_best || row.root_domain),
          website: row.root_domain,
          rootDomain: row.root_domain,
          countryRegion: row.country || row.region_hint || null,
          contactEmail: row.email_best || null,
          contactPhone: row.phone_best || null,
        },
      });
      companiesCreated++;
    } else {
      companiesMatched++;
      if (!company.rootDomain) {
        await prisma.company.update({
          where: { id: company.id },
          data: { rootDomain: row.root_domain },
        });
      }
    }

    const poolScore = row.total_score ? parseInt(row.total_score, 10) || null : null;
    const tsvFirstSeen = row.first_seen_at ? new Date(row.first_seen_at) : null;
    const tsvLastSeen = row.last_seen_at ? new Date(row.last_seen_at) : null;
    const tsvSourceCount = row.source_count ? parseInt(row.source_count, 10) || 0 : 0;

    const existingLeads = await prisma.lead.findMany({
      where: {
        companyId: company.id,
        discoveryRequest: { userId, status: "published" },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, discoveryRequestId: true, status: true, sourceType: true, createdAt: true },
    });

    const leadAppearCount = existingLeads.length;
    const latestLead = existingLeads[0] ?? null;
    const leadSourceTypes = new Set(existingLeads.map((l) => l.sourceType).filter(Boolean));

    let leadFirstSeen: Date | null = null;
    let leadLastSeen: Date | null = null;
    for (const l of existingLeads) {
      if (!leadFirstSeen || l.createdAt < leadFirstSeen) leadFirstSeen = l.createdAt;
      if (!leadLastSeen || l.createdAt > leadLastSeen) leadLastSeen = l.createdAt;
    }

    let firstSeenAt = leadFirstSeen;
    if (tsvFirstSeen && (!firstSeenAt || tsvFirstSeen < firstSeenAt)) firstSeenAt = tsvFirstSeen;
    let lastSeenAt = leadLastSeen;
    if (tsvLastSeen && (!lastSeenAt || tsvLastSeen > lastSeenAt)) lastSeenAt = tsvLastSeen;

    const sourceCount = Math.max(leadSourceTypes.size, tsvSourceCount);
    const buyerFit = row.buyer_fit || null;
    const matchLevel = computeMatchLevel(buyerFit, poolScore);

    const data = {
      rootDomain: row.root_domain,
      poolScore,
      matchLevel,
      appearCount: leadAppearCount,
      sourceCount,
      firstSeenAt,
      lastSeenAt,
      latestLeadId: latestLead?.id ?? null,
      latestRequestId: latestLead?.discoveryRequestId ?? null,
      latestLeadStatus: latestLead?.status ?? null,
      companyRole: row.company_role || null,
      businessModel: row.business_model || null,
      buyerFit,
      productCategoriesSummary: row.product_categories || null,
    };

    const existing = await prisma.customerPoolItem.findUnique({
      where: { userId_companyId: { userId, companyId: company.id } },
    });

    if (existing) {
      await prisma.customerPoolItem.update({
        where: { userId_companyId: { userId, companyId: company.id } },
        data,
      });
      poolUpdated++;
    } else {
      await prisma.customerPoolItem.create({
        data: { userId, companyId: company.id, ...data },
      });
      poolCreated++;
    }
  }

  console.log(`Companies: ${companiesCreated} created, ${companiesMatched} matched`);
  console.log(`Pool items: ${poolCreated} created, ${poolUpdated} updated`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
