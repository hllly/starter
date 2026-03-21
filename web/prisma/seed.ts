import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { phone: "13800000001" },
    update: {},
    create: {
      phone: "13800000001",
      name: "种子用户",
      status: "active",
    },
  });
  console.log("Seed user created:", user.id, user.phone, user.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
