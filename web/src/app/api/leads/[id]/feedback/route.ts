import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { leadFeedbackSchema } from "@/lib/validations/feedback";
import { requireUser, apiError, FEEDBACK_ACTION_TO_LEAD_STATUS } from "@/lib/api-helpers";
import { upsertPoolItem } from "@/lib/pool-sync";

export async function POST(
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
    return apiError("只能对已发布任务的线索提交反馈", 403);
  }

  const body = await req.json();
  const parsed = leadFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }

  const newLeadStatus = FEEDBACK_ACTION_TO_LEAD_STATUS[parsed.data.action];

  const result = await prisma.$transaction(async (tx) => {
    const feedback = await tx.leadFeedback.create({
      data: {
        leadId: id,
        userId: user.id,
        action: parsed.data.action,
        reason: parsed.data.reason,
        note: parsed.data.note,
      },
    });

    await tx.lead.update({
      where: { id },
      data: { status: newLeadStatus as never },
    });

    return feedback;
  });

  try {
    await upsertPoolItem(user.id, lead.companyId);
  } catch (e) {
    console.error(`Failed to sync pool item after feedback:`, e);
  }

  return NextResponse.json(
    {
      id: result.id,
      leadId: id,
      action: result.action,
      leadStatus: newLeadStatus,
      createdAt: result.createdAt,
    },
    { status: 201 }
  );
}
