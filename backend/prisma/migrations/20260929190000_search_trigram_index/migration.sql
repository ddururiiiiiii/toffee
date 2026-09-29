-- 검색 속도: 글자 조각(pg_trgm) 색인(2026-09-29) — 방 안 메시지 검색, 운영자 회원 검색의 ILIKE '%…%'
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "Message_body_trgm_idx" ON "Message" USING GIN ("body" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_displayName_trgm_idx" ON "User" USING GIN ("displayName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_nickname_trgm_idx" ON "User" USING GIN ("nickname" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);

