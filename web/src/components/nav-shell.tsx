"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, FileText, Users, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const NAV_ITEMS = [
  { href: "/discover", label: "客户发现", icon: Search },
  { href: "/leads", label: "已发掘客户线索", icon: FileText },
  { href: "/customer-pool", label: "客户池", icon: Users },
];

export function NavShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link
              href="/discover"
              className="text-sm font-semibold tracking-tight text-foreground"
            >
              客户发现工作台
            </Link>
            <Separator orientation="vertical" className="h-5" />
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              <ComingSoonNav label="客户维护" className="ml-1" />
              <ComingSoonNav label="客户自动跟进" />
              <ComingSoonNav label="客户深度追踪" />
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{userName}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="h-8 text-xs text-muted-foreground">
              <LogOut className="mr-1 h-3.5 w-3.5" />
              退出
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function ComingSoonNav({ label, className = "" }: { label: string; className?: string }) {
  const [show, setShow] = useState(false);

  return (
    <span
      className={`relative rounded-md px-3 py-1.5 text-sm text-muted-foreground/40 cursor-default ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {label}
      {show && (
        <span
          className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap pointer-events-none z-50"
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#0F7A5A",
            backgroundColor: "#E4F6EE",
            border: "1px solid #B5E6D4",
            borderRadius: "12px",
            padding: "8px 14px",
            boxShadow: "0 4px 16px rgba(15,122,90,0.12)",
          }}
        >
          <span
            className="absolute left-1/2 -top-1.5 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderBottom: "6px solid #B5E6D4",
            }}
          />
          当前未全量开放，可联系后台
        </span>
      )}
    </span>
  );
}
