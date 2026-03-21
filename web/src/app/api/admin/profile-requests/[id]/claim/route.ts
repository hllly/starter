import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const request = await prisma.companyProfileRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "请求不存在" }, { status: 404 });
  if (request.status !== "queued") {
    return NextResponse.json(
      { error: "invalid_status", message: `当前状态为 ${request.status}，只有 queued 可领取` },
      { status: 409 }
    );
  }

  const updated = await prisma.companyProfileRequest.update({
    where: { id },
    data: {
      status: "claimed",
      claimedBy: "admin",
      claimedAt: new Date(),
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    claimedAt: updated.claimedAt,
  });
}
