import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { batchFeedbackSchema } from "@/lib/validations/feedback";
import { requireUser, apiError } from "@/lib/api-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const { id } = await params;

  const request = await prisma.discoveryRequest.findUnique({ where: { id } });
  if (!request || request.userId !== user.id) {
    return apiError("任务不存在", 404);
  }
  if (request.status !== "published") {
    return apiError("只能对已发布的任务提交反馈", 403);
  }

  const body = await req.json();
  const parsed = batchFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }

  const feedback = await prisma.batchFeedback.create({
    data: {
      discoveryRequestId: id,
      userId: user.id,
      helpfulness: parsed.data.helpfulness,
      note: parsed.data.note,
    },
  });

  return NextResponse.json(
    {
      id: feedback.id,
      discoveryRequestId: id,
      helpfulness: feedback.helpfulness,
      createdAt: feedback.createdAt,
    },
    { status: 201 }
  );
}
