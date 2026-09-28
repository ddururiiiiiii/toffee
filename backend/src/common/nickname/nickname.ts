import { BadRequestException } from '@nestjs/common';

export const NICKNAME_MAX_LENGTH = 20;
// 닉네임 변경 간격(잠정 7일, STATUS.md "출시 전 확정할 정책") — 인용된 뒤 바로 바꿔 숨는 걸 막는 정도
export const NICKNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// 공식·운영자인 척 못 하게 막는 단어(대소문자 무시, 포함 여부). 배우 이름과 똑같은 닉네임은 서비스에서 따로 막음.
const RESERVED_WORDS = ['공식', '운영자', '관리자', 'official', 'admin', 'toffee', '토피', 'ทางการ', '公式', '官方'];

/** 앞뒤 공백 제거·연속 공백 하나로, 길이·줄바꿈·제어문자·예약어 검사. 통과하면 정리된 닉네임 반환 */
export function normalizeNickname(raw: string): string {
  const nickname = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (nickname.length === 0) throw new BadRequestException('닉네임을 입력해주세요.');
  if ([...nickname].length > NICKNAME_MAX_LENGTH) {
    throw new BadRequestException(`닉네임은 ${NICKNAME_MAX_LENGTH}자까지 쓸 수 있어요.`);
  }
  // 제어문자·보이지 않는 문자(zero-width 등)로 다른 사람 닉네임을 흉내 내는 것 방지
  if (/[\p{Cc}\p{Cf}]/u.test(nickname)) throw new BadRequestException('사용할 수 없는 문자가 있어요.');
  const lower = nickname.toLowerCase();
  if (RESERVED_WORDS.some((word) => lower.includes(word.toLowerCase()))) {
    throw new BadRequestException('사용할 수 없는 단어가 포함되어 있어요.');
  }
  return nickname;
}

/** 같은 닉네임 구분용 짧은 태그 — 스타·소속사·운영자 화면에서만 표시(팬끼리는 안 보임) */
export function fanTag(userId: string): string {
  return `#${userId.replace(/-/g, '').slice(-4).toUpperCase()}`;
}
