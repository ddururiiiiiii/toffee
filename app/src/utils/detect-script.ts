/**
 * 글이 어떤 글자로 쓰였는지 대충 보고(한글·태국 문자·일본 가나·한자·라틴) 지금 앱 언어와 다르면 "번역 보기"를 보여 줌(2026-09-29).
 * 서버 번역 호출 없이 판단하려고 — 정확한 언어 판별이 아니라 "다른 글자인가"만 봄. 이모지·숫자만 있는 글은 번역할 게 없어서 null.
 */
export type Script = 'hangul' | 'thai' | 'japanese' | 'han' | 'latin';

export function detectScript(text: string): Script | null {
  let hangul = 0;
  let thai = 0;
  let kana = 0;
  let han = 0;
  let latin = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f)) hangul += 1;
    else if (code >= 0x0e00 && code <= 0x0e7f) thai += 1;
    else if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) kana += 1;
    else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) han += 1;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x24f)) latin += 1;
  }
  // 일본어는 한자와 가나가 섞여 있음 — 가나가 조금이라도 있으면 일본어로
  if (kana > 0 && kana + han >= Math.max(hangul, thai, latin)) return 'japanese';
  const counts: [Script, number][] = [
    ['hangul', hangul],
    ['thai', thai],
    ['han', han],
    ['latin', latin],
  ];
  const [best, count] = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return count > 0 ? best : null;
}

const SCRIPT_OF_LANGUAGE: Record<string, Script> = { ko: 'hangul', th: 'thai', ja: 'japanese', en: 'latin', 'zh-Hans': 'han', 'zh-Hant': 'han' };

/** 이 글을 지금 앱 언어로 번역해 볼 만한지 — 글자 종류가 다를 때만 */
export function needsTranslation(text: string | null | undefined, language: string): boolean {
  if (!text) return false;
  const script = detectScript(text);
  const mine = SCRIPT_OF_LANGUAGE[language] ?? SCRIPT_OF_LANGUAGE[language.split('-')[0]];
  return !!script && !!mine && script !== mine;
}
