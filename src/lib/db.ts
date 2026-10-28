import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db =
  globalDb.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://proofpay:proofpay_local_only@localhost:5438/proofpay',
    }),
  });
if (process.env.NODE_ENV !== 'production') globalDb.prisma = db;
