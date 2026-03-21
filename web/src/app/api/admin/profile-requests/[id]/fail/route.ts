import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const request = await prisma.companyProfileRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "请求不存在" }, { status: 404 });
  if (!["claimed", "running"].includes(request.status)) {
    return NextResponse.json(
      { error: "invalid_status", message: `当前状态为 ${request.status}，只有 claimed/running 可标记失败` },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));

  await prisma.$transaction(async (tx) => {
    await tx.customerPoolItem.updateMany({
      where: { companyId: request.companyId },
      data: { profileStatus: "failed" },
    });

    // Delete this failed request and any other pending requests for the same company
    await tx.companyProfileRequest.deleteMany({
      where: {
        companyId: request.companyId,
        id: { not: id },
        status: { in: ["queued", "claimed"] },
      },
    });
    await tx.companyProfileRequest.delete({ where: { id } });
  });

  return NextResponse.json({
    id,
    status: "pr_failed",
    errorSummary: body.error_summary || "Profile build failed",
  });
}
