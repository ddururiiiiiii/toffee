/**
 * 데모 서버 데이터 넣기(2026-10-01) — 컨테이너 시작 때 docker-entrypoint.sh가 마이그레이션 다음에 실행.
 * Railway 변수 DEMO_SEED로 조절(버튼 = 변수 바꾸고 Deploy):
 * - "true": DB에 회원이 하나도 없을 때만 가짜 데이터를 넣음 → 켜 둬도 재시작마다 지워지지 않음
 * - "reset": 켤 때마다 전부 지우고 다시 넣음 → 초기화한 뒤엔 "true"로 되돌릴 것
 * 운영(NODE_ENV=production)에선 어떤 값이어도 실행하지 않음(데이터를 지우는 스크립트라).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedDemo } from './demo-seed.js';
import { decideSeed } from './demo-mode.js';

async function run() {
  const mode = process.env.DEMO_SEED?.trim();
  if (!mode) return;
  const decision = decideSeed(mode, process.env.NODE_ENV);
  if (decision === 'skip-production') return console.warn('[demo-seed] 운영 서버라 데모 데이터를 넣지 않음');
  if (decision === 'skip-unknown') return console.warn(`[demo-seed] DEMO_SEED="${mode}"는 모르는 값 — "true" 또는 "reset"만`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    if (decision === 'seed-if-empty' && (await prisma.user.count()) > 0) {
      return console.log('[demo-seed] 이미 데이터가 있어 건너뜀(다시 넣으려면 DEMO_SEED=reset)');
    }
    await seedDemo(prisma);
    console.log(`[demo-seed] 완료(${decision === 'reset' ? '초기화 후 다시 넣음' : '빈 DB에 넣음'})`);
  } finally {
    await prisma.$disconnect();
  }
}

// 테스트에서 import할 땐 실행하지 않음
if (process.argv[1]?.endsWith('seed-cli.js')) {
  run().catch((error: unknown) => {
    console.error('[demo-seed] 실패:', error);
    process.exitCode = 1;
  });
}
