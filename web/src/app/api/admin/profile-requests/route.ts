import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "queued";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  const requests = await prisma.companyProfileRequest.findMany({
    where: { status: status as never },
    include: {
      company: {
        select: {
          id: true,
          companyName: true,
          website: true,
          rootDomain: true,
          countryRegion: true,
        },
      },
      requester: {
        select: { id: true, name: true, phone: true },
      },
    },
    orderBy: { requestedAt: "asc" },
    take: limit,
  });

  return NextResponse.json({
    data: requests.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      company: r.company,
      requester: r.requester,
      status: r.status,
      claimedBy: r.claimedBy,
      requestedAt: r.requestedAt,
      claimedAt: r.claimedAt,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      runId: r.runId,
      errorSummary: r.errorSummary,
    })),
    total: requests.length,
  });
}
