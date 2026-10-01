#!/bin/sh
# 컨테이너 시작 — DB 마이그레이션을 적용하고 서버를 켬.
# 서버를 여러 대 띄우는 호스팅에선 RUN_MIGRATIONS=false로 두고 배포 단계(release command)에서 한 번만
# `npx prisma migrate deploy`를 돌릴 것(동시에 여러 대가 마이그레이션하지 않게).
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npx prisma migrate deploy
fi
# 데모 서버면 가짜 데이터(DEMO_SEED=true|reset, src/demo/seed-cli.ts) — 실패해도 서버는 켬(로그에 이유)
if [ -n "${DEMO_SEED:-}" ]; then
  node dist/demo/seed-cli.js || echo "[demo-seed] 데모 데이터 넣기 실패 — 위 로그 확인"
fi
exec node --import ./dist/instrument.js dist/main
