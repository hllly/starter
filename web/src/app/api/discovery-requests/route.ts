import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createDiscoveryRequestSchema } from "@/lib/validations/discovery-request";
import { requireUser, apiError, STATUS_TEXT } from "@/lib/api-helpers";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const body = await req.json();
  const parsed = createDiscoveryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }
  const data = parsed.data;

  function buildHashInput(pc: string, tr: unknown, bt: unknown, pd: string, ao: unknown) {
    return JSON.stringify({ productCategory: pc, targetRegions: tr, buyerTypes: bt, priorityDirection: pd, advancedOptions: ao ?? null });
  }

  const paramHash = crypto
    .createHash("md5")
    .update(buildHashInput(data.productCategory, data.targetRegions, data.buyerTypes, data.priorityDirection, data.advancedOptions))
    .digest("hex");

  const thirtySecsAgo = new Date(Date.now() - 30_000);
  const recent = await prisma.discoveryRequest.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: thirtySecsAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recent) {
    const recentHash = crypto
      .createHash("md5")
      .update(buildHashInput(
        recent.productCategory,
        recent.targetRegions,
        recent.buyerTypes,
        recent.priorityDirection,
        recent.advancedOptions,
      ))
      .digest("hex");

    if (recentHash === paramHash) {
      return NextResponse.json({
        id: recent.id,
        status: recent.status,
        createdAt: recent.createdAt,
        hint: "30秒内重复提交，返回已有任务",
      });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.discoveryRequest.create({
      data: {
        userId: user.id,
        productCategory: data.productCategory,
        targetRegions: data.targetRegions,
        buyerTypes: data.buyerTypes,
        priorityDirection: data.priorityDirection,
        advancedOptions: data.advancedOptions ?? undefined,
        status: "queued",
      },
    });

    await tx.job.create({
      data: {
        discoveryRequestId: request.id,
        userId: user.id,
        status: "queued",
      },
    });

    return request;
  });

  return NextResponse.json(
    {
      id: result.id,
      status: result.status,
      productCategory: result.productCategory,
      targetRegions: result.targetRegions,
      buyerTypes: result.buyerTypes,
      priorityDirection: result.priorityDirection,
      createdAt: result.createdAt,
    },
    { status: 201 }
  );
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));

  const [data, total] = await Promise.all([
    prisma.discoveryRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { leads: true } },
      },
    }),
    prisma.discoveryRequest.count({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    data: data.map((r) => ({
      id: r.id,
      productCategory: r.productCategory,
      targetRegions: r.targetRegions,
      status: r.status,
      statusText: STATUS_TEXT[r.status] || r.status,
      leadCount: r.status === "published" ? r._count.leads : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total,
    page,
    limit,
  });
}
