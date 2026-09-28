import { describe, expect, it } from 'vitest';
import { pushStrings } from './push-messages.js';
import { resolveLocale, SUPPORTED_LOCALES } from '../common/i18n/locales.js';

describe('pushStrings', () => {
  it('지원 언어는 그 언어 문구, 모르는 값/null은 영어로', () => {
    expect(pushStrings('th').media.PHOTO).toBe('ส่งรูปภาพ');
    expect(pushStrings('zh-Hant').media.VIDEO).toBe('傳送了一段影片');
    expect(pushStrings(null).media.TEXT).toBe('You have a new message');
    expect(pushStrings('fr').staffNewStoryTitle('Caramel')).toBe('Caramel posted a new story');
    expect(resolveLocale('zh')).toBe('en');
  });

  it('모든 지원 언어에 모든 미디어 문구가 있다', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const strings = pushStrings(locale);
      for (const type of ['TEXT', 'PHOTO', 'AUDIO', 'VIDEO'] as const) expect(strings.media[type]).toBeTruthy();
    }
  });
});
