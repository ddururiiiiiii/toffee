// 음성 메시지 음파 모양 — 녹음 중 측정한 음량(dB)을 0~1 막대 높이로 바꾸고 원하는 칸 수로 맞춤.

/** 녹음기 metering(dB, 보통 -160~0) → 0~1. -50dB 이하는 조용한 것으로 봄 */
export function dbToLevel(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 50) / 50));
}

/** 샘플 여러 개를 n칸으로 — 칸마다 최대값을 써서 짧게 튄 소리도 보이게 */
export function resample(values: number[], n: number): number[] {
  if (values.length === 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const start = Math.floor((i * values.length) / n);
    const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / n));
    return Math.max(...values.slice(start, end));
  });
}

/** 음파 데이터가 없는 메시지(예전 메시지 등)용 — 메시지 id로 항상 같은 모양을 만듦 */
export function fallbackWaveform(seed: string, n: number): number[] {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const wave = 0.5 + 0.35 * Math.sin((i / n) * Math.PI * 3);
    return Math.min(1, Math.max(0.15, wave * (0.55 + (hash % 1000) / 2200)));
  });
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
