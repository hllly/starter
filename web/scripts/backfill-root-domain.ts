/**
 * Backfill companies.rootDomain from companies.website.
 * Usage: npx tsx scripts/backfill-root-domain.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function extractRootDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const withProto = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(withProto);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, website: true, rootDomain: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const c of companies) {
    const rd = extractRootDomain(c.website);
    if (c.rootDomain === rd) {
      skipped++;
      continue;
    }
    await prisma.company.update({
      where: { id: c.id },
      data: { rootDomain: rd },
    });
    updated++;
  }

  console.log(`Done. ${updated} updated, ${skipped} skipped (already correct). Total: ${companies.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
