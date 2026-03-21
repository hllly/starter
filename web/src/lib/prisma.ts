import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DB_ADAPTER = process.env.DB_ADAPTER ?? "neon"; // "neon" | "pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  neonErrorHandlerRegistered?: boolean;
};

function createPrismaClient(): PrismaClient {
  if (DB_ADAPTER === "pg") {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
    return new PrismaClient({ adapter: new PrismaPg(pool) });
  }

  const adapter = new PrismaNeon(
    { connectionString: process.env.DATABASE_URL! },
    {
      onPoolError: (err) => {
        console.warn("[neon-pool] idle client error (will reconnect):", err.message ?? err);
      },
    },
  );
  return new PrismaClient({ adapter });
}

// Neon WebSocket can emit browser-style ErrorEvent on connection drop.
// Absorb these to prevent process crash; Neon auto-reconnects on next query.
if (DB_ADAPTER === "neon" && !globalForPrisma.neonErrorHandlerRegistered) {
  globalForPrisma.neonErrorHandlerRegistered = true;
  process.on("uncaughtException", (err) => {
    const isNeonEvent =
      err != null &&
      typeof (err as Record<string, unknown>).type === "string" &&
      !(err instanceof Error);

    if (isNeonEvent) {
      console.warn(
        "[neon-ws] WebSocket error event absorbed:",
        (err as Record<string, unknown>).type,
      );
      return;
    }
    throw err;
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
