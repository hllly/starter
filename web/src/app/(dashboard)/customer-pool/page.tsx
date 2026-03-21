"use client";

import { PoolList } from "@/components/customer-pool/pool-list";

export default function CustomerPoolPage() {
  return (
    <div className="space-y-5">
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1C1C1A" }}>客户池</h1>
      <PoolList />
    </div>
  );
}
