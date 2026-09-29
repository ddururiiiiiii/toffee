/**
 * 부하 테스트(2026-09-29) — 배우 5~10명 규모 출시 전 "실시간 연결 N개 + 구독자 M명에게 스타 메시지" 상황을 로컬에서 재 봄.
 * 개발 서버(ENABLE_DEV_LOGIN=true)와 그 DB에만 쓸 것 — 가짜 구독자를 DB에 넣었다가 끝나면 지움.
 *
 *   node scripts/load-test.mjs --connections 2000 --subscribers 5000 --messages 5
 *
 * 재는 것: ① 실시간 연결 N개가 모두 열리는 시간 ② 스타가 메시지를 보냈을 때 발송 API 응답 시간(구독자 M명에게 푸시·상태
 * 갱신 포함) ③ 열려 있는 모든 연결에 신호가 도착하기까지 걸린 시간(p50/p95/최대).
 */
import pg from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []),
);
const API = args.api ?? 'http://localhost:3000';
const CONNECTIONS = Number(args.connections ?? 1000);
const SUBSCRIBERS = Number(args.subscribers ?? 3000);
const MESSAGES = Number(args.messages ?? 5);
const FAN_EMAIL = args.fan ?? 'fan1@toffee.demo';
const STAR_EMAIL = args.star ?? 'caramel-self@toffee.demo';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/toffee';

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
const ms = (n) => `${Math.round(n)}ms`;

async function login(email) {
  const res = await fetch(`${API}/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  if (!res.ok) throw new Error(`dev-login ${email}: ${res.status}`);
  return (await res.json()).accessToken;
}

/** SSE 연결 하나 — 'ready'를 받으면 resolve, 'change'를 받으면 onChange(도착 시각) */
function openStream(token, onChange, controller) {
  return new Promise((resolve, reject) => {
    fetch(`${API}/realtime`, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return reject(new Error(`realtime ${res.status}`));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (block.includes('event: ready')) resolve();
            if (block.includes('event: change')) onChange(performance.now());
          }
        }
      })
      .catch((error) => (error.name === 'AbortError' ? undefined : reject(error)));
  });
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
const fanToken = await login(FAN_EMAIL);
const starToken = await login(STAR_EMAIL);
const { rows: [actor] } = await db.query('SELECT a.id FROM "Actor" a JOIN "User" u ON u.id = a."selfUserId" WHERE u.email = $1', [STAR_EMAIL]);
if (!actor) throw new Error(`${STAR_EMAIL}에 연결된 배우 없음`);
console.log(`배우 ${actor.id} · 실시간 연결 ${CONNECTIONS} · 가짜 구독자 ${SUBSCRIBERS} · 메시지 ${MESSAGES}`);

// 가짜 구독자(발송 때 푸시 대상 조회·상태 갱신 부담용)
await db.query(`INSERT INTO "User" (id, email, "displayName", role, "updatedAt")
  SELECT 'loadtest-' || g, 'loadtest-' || g || '@toffee.test', 'load ' || g, 'USER', now() FROM generate_series(1, $1) g`, [SUBSCRIBERS]);
await db.query(`INSERT INTO "Subscription" (id, "userId", "actorId", "startedAt")
  SELECT 'loadtest-sub-' || g, 'loadtest-' || g, $2, now() FROM generate_series(1, $1) g`, [SUBSCRIBERS, actor.id]);

const controller = new AbortController();
const arrivals = [];
let sentAt = 0;
const t0 = performance.now();
try {
  await Promise.all(Array.from({ length: CONNECTIONS }, () => openStream(fanToken, (at) => sentAt && arrivals.push(at - sentAt), controller)));
  console.log(`① 연결 ${CONNECTIONS}개 열림: ${ms(performance.now() - t0)}`);

  const createdIds = [];
  for (let i = 0; i < MESSAGES; i++) {
    arrivals.length = 0;
    sentAt = performance.now();
    const res = await fetch(`${API}/actors/${actor.id}/messages/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${starToken}` },
      body: JSON.stringify({ mediaType: 'TEXT', body: `부하 테스트 ${i + 1}` }),
    });
    const apiMs = performance.now() - sentAt;
    createdIds.push((await res.json()).id);
    const deadline = performance.now() + 10_000;
    while (arrivals.length < CONNECTIONS && performance.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    const sorted = [...arrivals].sort((a, b) => a - b);
    console.log(
      `② 메시지 ${i + 1}: 발송 API ${ms(apiMs)} · ③ 신호 도착 ${sorted.length}/${CONNECTIONS} — p50 ${ms(pct(sorted, 50))}, p95 ${ms(pct(sorted, 95))}, 최대 ${ms(sorted.at(-1) ?? 0)}`,
    );
    await new Promise((r) => setTimeout(r, 500));
  }
  await db.query('DELETE FROM "Message" WHERE id = ANY($1)', [createdIds]);
} finally {
  controller.abort();
  await db.query(`DELETE FROM "SubscriptionEvent" WHERE "userId" LIKE 'loadtest-%'`);
  await db.query(`DELETE FROM "Subscription" WHERE id LIKE 'loadtest-sub-%'`);
  await db.query(`DELETE FROM "PushDevice" WHERE "userId" LIKE 'loadtest-%'`);
  await db.query(`DELETE FROM "User" WHERE id LIKE 'loadtest-%'`);
  await db.end();
}
