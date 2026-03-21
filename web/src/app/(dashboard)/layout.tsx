import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { NavShell } from "@/components/nav-shell";
import { prisma } from "@/lib/prisma";

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "default-dev-secret-change-in-production"
);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  if (!token) redirect("/login");

  let userId = "";
  let userName = "";
  try {
    const { payload } = await jwtVerify(token, secret);
    userId = (payload as { userId?: string }).userId ?? "";
    userName = (payload as { phone?: string }).phone ?? "";
  } catch {
    redirect("/login");
  }

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardedAt: true },
    });
    if (!user?.onboardedAt) {
      redirect("/onboarding");
    }
  }

  return <NavShell userName={userName}>{children}</NavShell>;
}
