import { describe, expect, it } from 'vitest';
import { detectScript, needsTranslation } from './detect-script';
import { IDLE_WARN_DAYS, idleDays } from './idle-days';
import { currentMonth, shiftMonth } from './month';
import { showNameToken } from './name-token';
import { STORE_PRODUCT_ID_PATTERN } from './store-product';
import { orderedProviders } from '@/components/social-button-style';

describe('번역 보기를 보여 줄지(글자 종류)', () => {
  it('글자 종류 판별', () => {
    expect(detectScript('오늘 촬영 끝!')).toBe('hangul');
    expect(detectScript('วันนี้ถ่ายละครเสร็จแล้ว')).toBe('thai');
    expect(detectScript('今日もありがとう！')).toBe('japanese');
    expect(detectScript('今天辛苦了')).toBe('han');
    expect(detectScript('See you tomorrow!')).toBe('latin');
    expect(detectScript('💛💛 !!')).toBeNull();
  });

  it('앱 언어와 다른 글자일 때만', () => {
    expect(needsTranslation('วันนี้ถ่ายละคร', 'ko')).toBe(true);
    expect(needsTranslation('오늘 촬영 끝', 'ko')).toBe(false);
    expect(needsTranslation('今天辛苦了', 'zh-Hant')).toBe(false);
    expect(needsTranslation('今日もありがとう', 'zh-Hans')).toBe(true);
    // 한국어 글에 영어 단어가 조금 섞여도 한글이 많으면 번역 안 띄움
    expect(needsTranslation('오늘 drama 촬영 끝났어', 'ko')).toBe(false);
    expect(needsTranslation('💛', 'en')).toBe(false);
    expect(needsTranslation(null, 'en')).toBe(false);
  });
});

describe('미발송 일수', () => {
  it('며칠 전인지, 없으면 null', () => {
    const now = new Date('2026-09-29T12:00:00Z').getTime();
    expect(idleDays('2026-09-22T11:00:00Z', now)).toBe(IDLE_WARN_DAYS);
    expect(idleDays('2026-09-29T01:00:00Z', now)).toBe(0);
    expect(idleDays(null, now)).toBeNull();
  });
});

describe('정산 달', () => {
  it('태국 시간 기준 이번 달, 앞뒤 달(연도 넘김)', () => {
    expect(currentMonth(new Date('2026-09-30T17:30:00Z'))).toBe('2026-10');
    expect(currentMonth(new Date('2026-09-30T16:30:00Z'))).toBe('2026-09');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('기타', () => {
  it('아티스트·소속사 화면의 팬 이름 자리 표시', () => {
    expect(showNameToken('{{name}}야 안녕 {{name}}', '팬 닉네임')).toBe('〈팬 닉네임〉야 안녕 〈팬 닉네임〉');
  });

  it('스토어 상품 ID 형식(서버와 같은 규칙)', () => {
    expect(STORE_PRODUCT_ID_PATTERN.test('toffee.actor.nawin')).toBe(true);
    expect(STORE_PRODUCT_ID_PATTERN.test('Toffee-Actor')).toBe(false);
    expect(STORE_PRODUCT_ID_PATTERN.test('.toffee')).toBe(false);
  });

  it('로그인 버튼 순서: 한국어면 카카오·네이버 먼저, 그 외엔 LINE 먼저(키 있는 것만)', () => {
    expect(orderedProviders(['google', 'kakao', 'line', 'apple'], 'ko')).toEqual(['kakao', 'apple', 'google', 'line']);
    expect(orderedProviders(['google', 'kakao', 'line', 'apple'], 'th')).toEqual(['line', 'apple', 'google', 'kakao']);
  });
});
