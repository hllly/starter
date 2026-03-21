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

  const poolItem = await prisma.customerPoolItem.findUnique({
    where: { id },
    select: { userId: true, companyId: true },
  });

  if (!poolItem) return apiError("客户池项目不存在", 404);
  if (poolItem.userId !== user.id) return apiError("无权限", 403);

  const leads = await prisma.lead.findMany({
    where: {
      companyId: poolItem.companyId,
      discoveryRequest: { userId: user.id },
    },
    include: {
      discoveryRequest: {
        select: { productCategory: true, status: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    data: leads.map((l) => ({
      id: l.id,
      sourceType: l.sourceType,
      sourcePlatform: l.sourcePlatform,
      buyerType: l.buyerType,
      currentTier: l.currentTier,
      recommendedAction: l.recommendedAction,
      recommendationReason: l.recommendationReason,
      status: l.status,
      createdAt: l.createdAt,
      taskCategory: l.discoveryRequest.productCategory,
      taskStatus: l.discoveryRequest.status,
    })),
  });
}
