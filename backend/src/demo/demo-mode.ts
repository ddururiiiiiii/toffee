// DEMO_SEED 값 해석(2026-10-01) — 컨테이너 시작 때 데이터 넣기(seed-cli)와 운영자 화면 초기화(DemoService)가 같이 씀
export type SeedDecision = 'skip-production' | 'skip-unknown' | 'seed-if-empty' | 'reset';

export function decideSeed(mode: string | undefined, nodeEnv: string | undefined): SeedDecision {
  if (nodeEnv === 'production') return 'skip-production';
  if (mode === 'true') return 'seed-if-empty';
  if (mode === 'reset') return 'reset';
  return 'skip-unknown';
}

/** 데모 서버인지(데모 초기화 버튼을 켤지) — production이 아니고 DEMO_SEED가 true/reset일 때 */
export const isDemoServer = (mode: string | undefined, nodeEnv: string | undefined) => {
  const decision = decideSeed(mode, nodeEnv);
  return decision === 'seed-if-empty' || decision === 'reset';
};
