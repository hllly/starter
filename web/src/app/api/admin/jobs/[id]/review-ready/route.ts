import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reviewReadyPayloadSchema } from "@/lib/validations/admin";
import { normalizeCompanyName, normalizeWebsite } from "@/lib/utils/normalize-company";
import { extractRootDomain } from "@/lib/pool-sync";
import type {
  Company,
  LeadBuyerType,
  LeadSourceType,
  LeadTier,
  RecommendedAction,
  ResultQuality,
} from "@/generated/prisma/client";

function buildNameRegionKey(normalizedName: string, countryRegion: string) {
  return `${normalizedName}::${countryRegion}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Job 不存在" }, { status: 404 });
  if (job.status !== "running") {
    return NextResponse.json(
      { error: "invalid_status_transition", message: `当前状态为 ${job.status}，只有 running 可提交结果` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const parsed = reviewReadyPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  let companiesCreated = 0;
  let companiesReused = 0;

  const preparedLeads = payload.leads.map((lp) => {
    const normalizedWeb = lp.website ? normalizeWebsite(lp.website) : null;
    const normalizedName = normalizeCompanyName(lp.company_name);
    const sourcePlatformHost = lp.source_platform
      ? lp.source_platform.replace(/^www\./i, "").toLowerCase()
      : null;
    const websiteIsPlatform = !!(
      normalizedWeb &&
      sourcePlatformHost &&
      (normalizedWeb === sourcePlatformHost ||
        normalizedWeb.endsWith(`.${sourcePlatformHost}`))
    );
    const effectiveWeb = websiteIsPlatform ? null : normalizedWeb;
    const countryRegion = lp.country_region ?? "";

    return {
      lp,
      normalizedName,
      effectiveWeb,
      rootDomain: websiteIsPlatform ? null : extractRootDomain(lp.website),
      companyKey: buildNameRegionKey(normalizedName, countryRegion),
      countryRegion,
    };
  });

  const result = await prisma.$transaction(async (tx) => {
    const companyByWebsite = new Map<string, Company>();
    const companyByNameRegion = new Map<string, Company>();

    const websiteList = Array.from(
      new Set(preparedLeads.map((p) => p.effectiveWeb).filter((v): v is string => !!v))
    );
    const pairMap = new Map(
      preparedLeads.map((p) => [p.companyKey, {
        normalizedName: p.normalizedName,
        countryRegion: p.countryRegion,
      }])
    );
    const nameRegionPairs = Array.from(pairMap.values());

    if (websiteList.length > 0) {
      const existingByWebsite = await tx.company.findMany({
        where: { website: { in: websiteList } },
      });
      for (const company of existingByWebsite) {
        if (company.website) companyByWebsite.set(company.website, company);
        companyByNameRegion.set(
          buildNameRegionKey(company.normalizedName, company.countryRegion ?? ""),
          company
        );
      }
    }

    if (nameRegionPairs.length > 0) {
      const existingByNameRegion = await tx.company.findMany({
        where: {
          OR: nameRegionPairs.map((pair) => ({
            normalizedName: pair.normalizedName,
            countryRegion: pair.countryRegion,
          })),
        },
      });
      for (const company of existingByNameRegion) {
        if (company.website) companyByWebsite.set(company.website, company);
        companyByNameRegion.set(
          buildNameRegionKey(company.normalizedName, company.countryRegion ?? ""),
          company
        );
      }
    }

    for (const prepared of preparedLeads) {
      const { lp, normalizedName, effectiveWeb, rootDomain, companyKey } = prepared;
      let company =
        (effectiveWeb ? companyByWebsite.get(effectiveWeb) : null) ??
        companyByNameRegion.get(companyKey) ??
        null;

      if (company) {
        companiesReused++;
      } else {
        company = await tx.company.create({
          data: {
            companyName: lp.company_name,
            normalizedName,
            website: effectiveWeb,
            rootDomain,
            countryRegion: lp.country_region,
            linkedinUrl: lp.linkedin_url ?? undefined,
            contactEmail: lp.contact_email ?? undefined,
            contactPhone: lp.contact_phone ?? undefined,
          },
        });
        companiesCreated++;
        if (company.website) companyByWebsite.set(company.website, company);
        companyByNameRegion.set(companyKey, company);
      }

      await tx.lead.create({
        data: {
          discoveryRequestId: job.discoveryRequestId,
          companyId: company.id,
          sourceType: (lp.source_type as LeadSourceType) ?? undefined,
          sourcePlatform: lp.source_platform ?? undefined,
          sourceUrl: lp.source_url ?? undefined,
          buyerType: (lp.buyer_type as LeadBuyerType) ?? undefined,
          currentTier: lp.current_tier as LeadTier,
          recommendationReason: lp.recommendation_reason,
          recommendedAction: (lp.recommended_action as RecommendedAction) ?? undefined,
          status: "new",
        },
      });
    }

    const recCount = payload.batch_summary.recommended_count;
    const obsCount = payload.batch_summary.observation_count;
    const runQuality = payload.quality_meta?.run_quality as string | undefined;
    let quality: ResultQuality = "normal";
    if (runQuality === "empty" || recCount + obsCount === 0) quality = "empty";
    else if (runQuality === "low_yield" || recCount < 3) quality = "low_yield";

    const sourceSummary = JSON.parse(JSON.stringify({
      source_breakdown: payload.batch_summary.source_breakdown ?? [],
      ...(payload.quality_meta ? { quality_meta: payload.quality_meta } : {}),
    }));

    await tx.jobResultSummary.create({
      data: {
        jobId: id,
        summaryText: payload.run_info.summary_text,
        recommendedCount: recCount,
        observationCount: obsCount,
        sourceSummaryText: payload.batch_summary.source_summary,
        sourceSummaryJson: sourceSummary,
        resultQuality: quality,
      },
    });

    const updatedJob = await tx.job.update({
      where: { id },
      data: {
        status: "awaiting_review",
        reviewReadyAt: new Date(),
        runId: payload.run_info.run_id,
      },
    });

    await tx.discoveryRequest.update({
      where: { id: updatedJob.discoveryRequestId },
      data: { status: "awaiting_review" },
    });

    return updatedJob;
  }, { maxWait: 20000, timeout: 120000 });

  return NextResponse.json({
    id: result.id,
    status: result.status,
    reviewReadyAt: result.reviewReadyAt,
    resultSummary: {
      recommendedCount: payload.batch_summary.recommended_count,
      observationCount: payload.batch_summary.observation_count,
      resultQuality:
        payload.batch_summary.recommended_count + payload.batch_summary.observation_count === 0
          ? "empty"
          : payload.batch_summary.recommended_count < 3
            ? "low_yield"
            : "normal",
    },
    leadsCreated: payload.leads.length,
    companiesCreated,
    companiesReused,
  });
}