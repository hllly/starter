import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leadStatusUpdateSchema } from "@/lib/validations/feedback";
import { requireUser, apiError } from "@/lib/api-helpers";

const VALID_TRANSITIONS: Record<string, string[]> = {
  contacted: ["following", "paused", "no_interest"],
  following: ["paused", "no_interest"],
  paused: ["following", "no_interest"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { discoveryRequest: true },
  });
  if (!lead) return apiError("线索不存在", 404);
  if (lead.discoveryRequest.userId !== user.id) return apiError("无权限", 403);
  if (lead.discoveryRequest.status !== "published") {
    return apiError("只能对已发布任务的线索推进状态", 403);
  }

  const body = await req.json();
  const parsed = leadStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }

  const allowed = VALID_TRANSITIONS[lead.status];
  if (!allowed || !allowed.includes(parsed.data.status)) {
    return NextResponse.json(
      {
        error: "invalid_status_transition",
        message: `线索当前状态为「${lead.status}」，不能推进到「${parsed.data.status}」`,
      },
      { status: 409 }
    );
  }

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      status: parsed.data.status as never,
      note: parsed.data.note,
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    note: updated.note,
    updatedAt: updated.updatedAt,
  });
}
