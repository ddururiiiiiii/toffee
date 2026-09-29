// 앱 끝-끝 확인(2026-09-29) — 실제 서버·웹 화면으로 핵심 흐름을 한 번에:
// 새 팬 가입(개발용 이메일 로그인) → 약관 → 생년월일 → 닉네임 → 배우 구독(결제 없는 테스트 구독) → 배우가 보낸 메시지가 채팅방에
// 보임({{name}} → 내 닉네임) → 답장 → 방 안 검색 → (정리) 구독 해지·탈퇴.
//
// 준비: backend(시드 데이터, ENABLE_DEV_LOGIN·ENABLE_SANDBOX_SUBSCRIBE=true)와 `npx expo start --web`을 띄워 둔 상태에서
//   npm run e2e            (API_URL=http://localhost:3000, WEB_URL=http://localhost:8081 기본값)
// 브라우저가 없으면 `npx playwright install chromium`. 실패하면 e2e/last-failure.png에 화면을 남김.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:3000';
const WEB = process.env.WEB_URL ?? 'http://localhost:8081';
const FAILURE_SHOT = fileURLToPath(new URL('./last-failure.png', import.meta.url));
const stamp = Date.now().toString(36);
const fanEmail = `e2e-${stamp}@toffee.test`;
const nickname = `e2e팬${stamp.slice(-4)}`;

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ko', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

const devLogin = async (email) => (await api('/auth/dev-login', { method: 'POST', body: { email } })).accessToken;

const steps = [];
async function step(name, fn) {
  const started = Date.now();
  await fn();
  steps.push(`✓ ${name} (${Date.now() - started}ms)`);
  console.log(steps.at(-1));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let fanToken;
let actorId;
let actorToken;
let broadcastId;

try {
  // 배우 본인 계정(시드: caramel-self)이 보내는 쪽
  actorToken = await devLogin('caramel-self@toffee.demo');
  actorId = (await api('/actors/mine', { token: actorToken })).find((actor) => actor.kind !== 'COUPLE')?.id;
  if (!actorId) throw new Error('시드 데이터에 배우 본인 계정이 연결된 배우가 없어요(npm run db:seed)');

  await step('새 팬 로그인', async () => {
    await page.goto(`${WEB}/login`);
    // 웹은 미리 그린 화면에 앱 코드가 붙는 동안(hydration) 입력값이 초기값으로 되돌아갈 수 있음 — 다 뜬 뒤에 입력하고 확인
    await page.waitForLoadState('networkidle');
    const email = page.getByPlaceholder('you@example.com');
    // 한 번에 채우면(fill) 앱 쪽 입력 상태가 안 바뀌는 경우가 있어 지우고 한 글자씩 입력
    await email.click();
    await email.press('ControlOrMeta+a');
    await email.press('Backspace');
    await email.pressSequentially(fanEmail);
    if ((await email.inputValue()) !== fanEmail) throw new Error('이메일 입력이 반영되지 않음');
    await page.getByText('계속하기', { exact: true }).click();
  });

  await step('약관 동의', async () => {
    await page.getByText('모두 동의', { exact: true }).click();
    await page.getByText('동의하고 시작하기', { exact: true }).click();
  });

  await step('생년월일', async () => {
    await page.getByPlaceholder('YYYY').fill('1995');
    await page.getByPlaceholder('MM').fill('05');
    await page.getByPlaceholder('DD').fill('10');
    await page.getByText('다음', { exact: true }).click();
  });

  await step('닉네임', async () => {
    await page.getByPlaceholder(/닉네임/).fill(nickname);
    await page.getByText('다음', { exact: true }).click();
    // 가입이 끝나면 팬 첫 화면으로 — 로그인 토큰을 꺼내 정리·확인용으로 씀
    await page.waitForURL((url) => !url.pathname.startsWith('/onboarding'), { timeout: 15_000 });
    fanToken = await page.evaluate(() => localStorage.getItem('toffee_access_token'));
  });

  await step('배우 구독(테스트 구독)', async () => {
    await page.goto(`${WEB}/actor/${actorId}`);
    await page.getByText('구독하고 메시지 받기', { exact: true }).click();
    await page.getByText(/에 구독하기$/).click();
    await page.getByText('메시지 시작하기', { exact: true }).click();
    await page.waitForURL(`**/chat/${actorId}`);
  });

  const broadcast = `e2e 인사 ${stamp} {{name}}`;
  await step('배우 메시지가 채팅방에 보임(이름 자리 → 내 닉네임)', async () => {
    broadcastId = (await api(`/actors/${actorId}/messages/broadcast`, { token: actorToken, method: 'POST', body: { mediaType: 'TEXT', body: broadcast } })).id;
    await page.getByText(`e2e 인사 ${stamp} ${nickname}`).waitFor({ timeout: 40_000 });
  });

  await step('답장 보내기', async () => {
    const reply = `e2e 답장 ${stamp}`;
    await page.getByPlaceholder('메시지 보내기').fill(reply);
    await page.getByLabel('보내기', { exact: true }).click();
    await page.getByText(reply).waitFor({ timeout: 15_000 });
  });

  await step('방 안 검색', async () => {
    await page.getByLabel('대화 검색').click();
    await page.getByPlaceholder('대화 내용 검색').fill(`인사 ${stamp}`);
    await page.getByText('1/1').waitFor({ timeout: 10_000 });
  });

  if (errors.length) throw new Error(`화면 오류: ${errors.join(' / ')}`);
  console.log(`\n모두 통과 (${steps.length}단계)`);
} catch (error) {
  await page.screenshot({ path: FAILURE_SHOT }).catch(() => {});
  console.error(`\n실패: ${error instanceof Error ? error.message : String(error)}\n화면: ${FAILURE_SHOT}`);
  process.exitCode = 1;
} finally {
  // 정리 — 테스트로 보낸 배우 메시지 삭제, 테스트 팬 구독 해지·탈퇴(실패해도 무시)
  if (broadcastId) await api(`/actors/${actorId}/messages/${broadcastId}`, { token: actorToken, method: 'DELETE' }).catch(() => {});
  if (fanToken && actorId) await api(`/actors/${actorId}/subscribe`, { token: fanToken, method: 'DELETE' }).catch(() => {});
  if (fanToken) await api('/auth/me', { token: fanToken, method: 'DELETE' }).catch(() => {});
  await browser.close();
}
