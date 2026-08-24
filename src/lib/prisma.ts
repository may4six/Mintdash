import { PrismaClient } from "@prisma/client";

// Next.js hot-reloads modules in dev, which would otherwise instantiate a
// new PrismaClient (and a new connection pool) on every file save. Stash
// the instance on globalThis so dev reuses it; production just creates one.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
