import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError } from "@/lib/api-helpers";

const businessProfileSchema = z.object({
  mainCategory: z.string().min(1, "请填写主品类"),
  subCategories: z.string().min(1, "请填写子品类/具体产品关键词"),
  targetRegions: z.array(z.string()).min(1, "至少选择一个目标国家/地区"),
  targetBuyerTypes: z.array(z.string()).min(1, "至少选择一种目标客户类型"),
  excludedBuyerTypes: z.array(z.string()).optional(),
  productPositioning: z.string().min(1, "请填写产品定位"),
  targetCustomerDesc: z.string().min(1, "请填写目标客户描述"),
  websiteUrl: z.string().optional(),
  coreSellingPoints: z.string().optional(),
  moqPriceRange: z.string().optional(),
  customerScalePref: z.string().optional(),
  exclusionConditions: z.string().optional(),
});

export async function GET() {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const profile = await prisma.userBusinessProfile.findUnique({
    where: { userId: user.id },
  });

  if (!profile) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({
    profile: {
      mainCategory: profile.mainCategory,
      subCategories: profile.subCategories,
      targetRegions: profile.targetRegions,
      targetBuyerTypes: profile.targetBuyerTypes,
      excludedBuyerTypes: profile.excludedBuyerTypes,
      productPositioning: profile.productPositioning,
      targetCustomerDesc: profile.targetCustomerDesc,
      websiteUrl: profile.websiteUrl,
      coreSellingPoints: profile.coreSellingPoints,
      moqPriceRange: profile.moqPriceRange,
      customerScalePref: profile.customerScalePref,
      exclusionConditions: profile.exclusionConditions,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("无效的请求体", 400);
  }

  const parsed = businessProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const d = parsed.data;

  await prisma.$transaction([
    prisma.userBusinessProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        mainCategory: d.mainCategory,
        subCategories: d.subCategories,
        targetRegions: d.targetRegions,
        targetBuyerTypes: d.targetBuyerTypes,
        excludedBuyerTypes: d.excludedBuyerTypes ?? [],
        productPositioning: d.productPositioning,
        targetCustomerDesc: d.targetCustomerDesc,
        websiteUrl: d.websiteUrl || null,
        coreSellingPoints: d.coreSellingPoints || null,
        moqPriceRange: d.moqPriceRange || null,
        customerScalePref: d.customerScalePref || null,
        exclusionConditions: d.exclusionConditions || null,
      },
      update: {
        mainCategory: d.mainCategory,
        subCategories: d.subCategories,
        targetRegions: d.targetRegions,
        targetBuyerTypes: d.targetBuyerTypes,
        excludedBuyerTypes: d.excludedBuyerTypes ?? [],
        productPositioning: d.productPositioning,
        targetCustomerDesc: d.targetCustomerDesc,
        websiteUrl: d.websiteUrl || null,
        coreSellingPoints: d.coreSellingPoints || null,
        moqPriceRange: d.moqPriceRange || null,
        customerScalePref: d.customerScalePref || null,
        exclusionConditions: d.exclusionConditions || null,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { onboardedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ success: true });
}
