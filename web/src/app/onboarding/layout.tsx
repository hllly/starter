import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-dev-secret-change-in-production"
);

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) redirect("/login");

  let userId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secret);
    userId = (payload as { userId?: string }).userId;
  } catch {
    redirect("/login");
  }

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardedAt: true },
    });
    if (user?.onboardedAt) {
      redirect("/discover");
    }
  }

  return <>{children}</>;
}
