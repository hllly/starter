import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError } from "@/lib/api-helpers";

export async function GET() {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const [total, byMatchLevel, withProfile, multiSeen] = await Promise.all([
    prisma.customerPoolItem.count({ where: { userId: user.id } }),
    prisma.customerPoolItem.groupBy({
      by: ["matchLevel"],
      where: { userId: user.id },
      _count: { id: true },
    }),
    prisma.customerPoolItem.count({
      where: { userId: user.id, profileStatus: { in: ["complete", "partial"] } },
    }),
    prisma.customerPoolItem.count({
      where: { userId: user.id, appearCount: { gte: 2 } },
    }),
  ]);

  const levelCounts: Record<string, number> = { high: 0, medium: 0, low: 0, unknown: 0 };
  byMatchLevel.forEach((row) => {
    levelCounts[row.matchLevel] = row._count.id;
  });

  return NextResponse.json({ total, byMatchLevel: levelCounts, withProfile, multiSeen });
}
