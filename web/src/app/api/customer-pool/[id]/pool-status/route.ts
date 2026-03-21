import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const updateSchema = z.object({
  poolStatus: z.enum(["active", "watching", "following", "archived", "excluded"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const { id } = await params;

  const poolItem = await prisma.customerPoolItem.findUnique({
    where: { id },
  });

  if (!poolItem) return apiError("客户池项目不存在", 404);
  if (poolItem.userId !== user.id) return apiError("无权限", 403);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }

  const data: Record<string, unknown> = { poolStatus: parsed.data.poolStatus };
  if (parsed.data.note !== undefined) data.note = parsed.data.note;

  const updated = await prisma.customerPoolItem.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    id: updated.id,
    poolStatus: updated.poolStatus,
    note: updated.note,
  });
}
