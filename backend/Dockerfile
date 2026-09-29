# 토피 백엔드 실행 이미지(2026-09-29) — 어느 호스팅(Railway·Render·Fly.io·Cloud Run 등)에서나 같은 방식으로 뜨게.
# 빌드: docker build -t toffee-backend .   실행: docker run --env-file .env -p 3000:3000 toffee-backend
# 필요한 환경변수는 .env.example 참고 — 빠진 필수값은 켜자마자 로그에 알려주고 멈춤(common/config/env-check.ts).

# 1) 빌드: 의존성 설치 → Prisma 클라이언트 생성 → TypeScript 빌드
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npx nest build && npm prune --omit=dev

# 2) 실행: 빌드 결과와 운영 의존성만
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma7.config.ts /app/package.json ./
COPY docker-entrypoint.sh ./
USER node
EXPOSE 3000
# 헬스체크는 호스팅 설정에서 GET /health(가벼움) 또는 /health/ready(DB까지)로
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
