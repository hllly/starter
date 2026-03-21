import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { z } from "zod";

const loginSchema = z.object({
  phone: z
    .string()
    .min(1, "请输入手机号")
    .regex(/^[\d\-+\s()]+$/, "手机号格式不正确"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const phone = parsed.data.phone.replace(/[\s\-()]/g, "");

    const user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      return NextResponse.json(
        { error: "该手机号未在系统中注册" },
        { status: 401 }
      );
    }

    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "账号已被停用" },
        { status: 403 }
      );
    }

    await createSession(user.id, user.phone);

    return NextResponse.json({
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        status: user.status,
        onboarded: !!user.onboardedAt,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
