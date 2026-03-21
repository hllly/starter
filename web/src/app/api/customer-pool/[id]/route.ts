import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const { id } = await params;

  const item = await prisma.customerPoolItem.findUnique({
    where: { id },
    include: {
      company: true,
    },
  });

  if (!item) return apiError("客户池项目不存在", 404);
  if (item.userId !== user.id) return apiError("无权限", 403);

  const profile = await prisma.companyProfile.findUnique({
    where: { companyId: item.companyId },
  });

  return NextResponse.json({
    ...item,
    profile: profile
      ? {
          id: profile.id,
          profileStatus: profile.profileStatus,
          profileQuality: profile.profileQuality,
          emailBest: profile.emailBest,
          phoneBest: profile.phoneBest,
          contactPageUrl: profile.contactPageUrl,
          country: profile.country,
          city: profile.city,
          businessModel: profile.businessModel,
          companyRole: profile.companyRole,
          buyerFit: profile.buyerFit,
          buyerFitReason: profile.buyerFitReason,
          productCategories: profile.productCategories,
          coreProducts: profile.coreProducts,
          targetMarkets: profile.targetMarkets,
          industryFocus: profile.industryFocus,
          importSignal: profile.importSignal,
          employeeRange: profile.employeeRange,
          revenueRange: profile.revenueRange,
          certifications: profile.certifications,
          evidenceNotes: profile.evidenceNotes,
          profileLastUpdatedAt: profile.profileLastUpdatedAt,
        }
      : null,
  });
}
