// 로컬 개발용 시드 — 실행: npx prisma db seed. 내용은 src/demo/demo-seed.ts(데모 서버도 같은 데이터를 씀)
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemo } from '../src/demo/demo-seed.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

seedDemo(prisma)
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
