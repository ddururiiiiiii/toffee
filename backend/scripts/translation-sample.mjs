// 번역 품질 미리 보기(2026-09-29) — 배우·팬 말투 예문을 6개 언어로 번역해서 보여 줌. 실제 키로 돌리므로 비용이 조금 듦(예문 몇 개 × 언어 수).
// 사용: npx nest build && ANTHROPIC_API_KEY=... node scripts/translation-sample.mjs [대상 언어 ...]
// 예: node scripts/translation-sample.mjs th ja  →  태국어·일본어만. TRANSLATION_MODEL로 모델을 바꿔 비교할 수 있음
import { ClaudeTranslationProvider } from '../dist/translation/translation-provider.js';

// [문장, 누가 쓴 것] — 성별에 따라 1인칭·끝맺음이 달라지는지도 보게 아티스트는 여성·남성·모름을 섞음
const SAMPLES = [
  ['{{name}}야 오늘 촬영 끝났어! 너무 피곤한데 너 생각나서 연락했어 ㅎㅎ', { role: 'artist', gender: 'FEMALE' }],
  ['오늘 비 온대~ 우산 꼭 챙겨 🌂 감기 걸리면 나한테 혼나', { role: 'artist', gender: 'MALE' }],
  ['밥은 먹었쪄? 나는 방금 김밥 먹었는데 너랑 같이 먹고 싶당 🥺', { role: 'artist', gender: null }],
  ['헐 대박 ㅋㅋㅋㅋㅋ 너 진짜 웃기다', { role: 'artist', gender: 'MALE' }],
  ['오늘 무대 어땠어?? 떨려서 죽는 줄 ㅠㅠ', { role: 'artist', gender: 'FEMALE' }],
  ['วันนี้ถ่ายละครเสร็จแล้ว คิดถึงทุกคนนะ 💛', { role: 'artist', gender: 'FEMALE' }],
  ['오빠 오늘도 수고했어요!! 드라마 너무 재밌어요 😭😭', { role: 'fan' }],
  ['555555 ตลกมากกก', { role: 'fan' }],
  ['今日もありがとう！また明日ね', { role: 'fan' }],
];
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['ko', 'th', 'en', 'ja', 'zh-Hans', 'zh-Hant'];
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY가 필요해요');
  process.exit(1);
}
const provider = new ClaudeTranslationProvider(apiKey, process.env.TRANSLATION_MODEL || 'claude-opus-5-5');
for (const [text, speaker] of SAMPLES) {
  console.log(`\n원문(${speaker.role}${speaker.gender ? ' ' + speaker.gender : ''}): ${text}`);
  for (const target of targets) {
    try {
      console.log(`  ${target.padEnd(7)} ${await provider.translate(text, target, speaker)}`);
    } catch (error) {
      console.log(`  ${target.padEnd(7)} (실패: ${error instanceof Error ? error.message : String(error)})`);
    }
  }
}
