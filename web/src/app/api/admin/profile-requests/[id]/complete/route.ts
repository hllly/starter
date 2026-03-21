import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProfileToPoolItem, computeMatchLevel } from "@/lib/pool-sync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const request = await prisma.companyProfileRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "请求不存在" }, { status: 404 });
  if (request.status !== "running") {
    return NextResponse.json(
      { error: "invalid_status", message: `当前状态为 ${request.status}，只有 running 可完成` },
      { status: 409 }
    );
  }

  const body = await req.json();
  const profileData = body.profile;
  const runId = body.run_id;

  const profileFields = {
    rootDomain: profileData.root_domain,
    profileQuality: profileData.profile_quality || "medium",
    profileRunId: runId,
    emailBest: profileData.email_best,
    emailAlt: profileData.email_alt,
    phoneBest: profileData.phone_best,
    phoneAlt: profileData.phone_alt,
    contactPageUrl: profileData.contact_page_url,
    contactFormUrl: profileData.contact_form_url,
    linkedinCompanyUrl: profileData.linkedin_company_url,
    country: profileData.country,
    stateRegion: profileData.state_region,
    city: profileData.city,
    addressRaw: profileData.address_raw,
    foundedYear: profileData.founded_year,
    businessModel: profileData.business_model,
    companyRole: profileData.company_role,
    buyerFit: profileData.buyer_fit,
    buyerFitReason: profileData.buyer_fit_reason,
    productCategories: profileData.product_categories,
    coreProducts: profileData.core_products,
    targetMarkets: profileData.target_markets,
    industryFocus: profileData.industry_focus,
    importSignal: profileData.import_signal,
    oemOdmSignal: profileData.oem_odm_signal,
    privateLabelSignal: profileData.private_label_signal,
    vendorOnboardingSignal: profileData.vendor_onboarding_signal,
    moqSampleSignal: profileData.moq_sample_signal,
    procurementSignalNotes: profileData.procurement_signal_notes,
    employeeRange: profileData.employee_range,
    revenueRange: profileData.revenue_range,
    facilitySignal: profileData.facility_signal,
    certifications: profileData.certifications,
    evidenceUrls: profileData.evidence_urls,
    evidenceNotes: profileData.evidence_notes,
    pagesVisitedCount: profileData.pages_visited_count,
    rawProfileJson: profileData.raw_json,
  };

  await prisma.$transaction(async (tx) => {
    await tx.companyProfile.upsert({
      where: { companyId: request.companyId },
      create: {
        companyId: request.companyId,
        profileStatus: "complete",
        profileVersion: 1,
        profileFirstBuiltAt: new Date(),
        profileLastUpdatedAt: new Date(),
        ...profileFields,
      },
      update: {
        profileStatus: "complete",
        profileVersion: { increment: 1 },
        profileLastUpdatedAt: new Date(),
        ...profileFields,
      },
    });

    // Delete this completed request and any other pending requests for the same company
    await tx.companyProfileRequest.deleteMany({
      where: {
        companyId: request.companyId,
        id: { not: id },
        status: { in: ["queued", "claimed"] },
      },
    });
    await tx.companyProfileRequest.delete({ where: { id } });
  });

  const syncedFields = await syncProfileToPoolItem(request.companyId);
  if (syncedFields) {
    const buyerFit = syncedFields.buyerFit ?? null;
    const poolItem = await prisma.customerPoolItem.findFirst({
      where: { companyId: request.companyId },
      select: { poolScore: true },
    });
    const matchLevel = computeMatchLevel(buyerFit, poolItem?.poolScore ?? null);

    await prisma.customerPoolItem.updateMany({
      where: { companyId: request.companyId },
      data: { ...syncedFields, matchLevel },
    });
  }

  return NextResponse.json({
    id,
    status: "completed",
    message: "Profile saved and pool items synced",
  });
}
