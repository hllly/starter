import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-dev-secret-change-in-production"
);

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) redirect("/login");

  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = (payload as { userId?: string }).userId;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { onboardedAt: true },
      });
      if (!user?.onboardedAt) redirect("/onboarding");
    }
  } catch {
    redirect("/login");
  }

  redirect("/discover");
}
