import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const request = await prisma.companyProfileRequest.findUnique({
    where: { id },
    include: {
      company: true,
      requester: { select: { id: true, phone: true, name: true } },
    },
  });

  if (!request) return NextResponse.json({ error: "请求不存在" }, { status: 404 });

  return NextResponse.json({
    id: request.id,
    status: request.status,
    company: {
      id: request.company.id,
      companyName: request.company.companyName,
      website: request.company.website,
      rootDomain: request.company.rootDomain,
      countryRegion: request.company.countryRegion,
      contactEmail: request.company.contactEmail,
    },
    requester: request.requester,
    userPhone: request.requester.phone,
  });
}
