import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, apiError } from "@/lib/api-helpers";

// ── Policy ────────────────────────────────────────────────────────
// Controlled by env var PROFILE_REQUEST_POLICY:
//   "test"         — no limit, always allow re-submission
//   "once_per_day" — one request per company per user per calendar day
//   "once"         — block if a complete profile already exists
const POLICY = (process.env.PROFILE_REQUEST_POLICY ?? "test") as
  | "test"
  | "once_per_day"
  | "once";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return apiError("未登录", 401);

  const { id } = await params;

  const poolItem = await prisma.customerPoolItem.findUnique({
    where: { id },
    include: { company: { select: { id: true, rootDomain: true, companyName: true } } },
  });

  if (!poolItem) return apiError("客户池项目不存在", 404);
  if (poolItem.userId !== user.id) return apiError("无权限", 403);

  // Always block if a request is already in-flight (regardless of policy)
  const inFlight = await prisma.companyProfileRequest.findFirst({
    where: {
      companyId: poolItem.companyId,
      status: { in: ["queued", "claimed", "running"] },
    },
  });
  if (inFlight) {
    return NextResponse.json({
      message: "已有进行中的画像请求",
      requestId: inFlight.id,
      status: inFlight.status,
    });
  }

  // ── Policy checks ────────────────────────────────────────────────
  if (POLICY === "once") {
    const profile = await prisma.companyProfile.findUnique({
      where: { companyId: poolItem.companyId },
      select: { profileStatus: true },
    });
    if (profile?.profileStatus === "complete") {
      return NextResponse.json(
        { message: "该公司已有完成的深度画像，当前策略不允许重复请求", status: "complete" },
        { status: 409 }
      );
    }
  }

  if (POLICY === "once_per_day") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRequest = await prisma.companyProfileRequest.findFirst({
      where: {
        companyId: poolItem.companyId,
        requestedBy: user.id,
        requestedAt: { gte: todayStart },
      },
    });
    if (todayRequest) {
      return NextResponse.json(
        { message: "今天已提交过画像请求，每客户每天限一次", status: todayRequest.status },
        { status: 429 }
      );
    }
  }

  // "test" policy falls through with no extra checks

  const request = await prisma.companyProfileRequest.create({
    data: {
      companyId: poolItem.companyId,
      requestedBy: user.id,
    },
  });

  return NextResponse.json(
    {
      id: request.id,
      companyId: request.companyId,
      status: request.status,
      requestedAt: request.requestedAt,
      policy: POLICY,
    },
    { status: 201 }
  );
}
