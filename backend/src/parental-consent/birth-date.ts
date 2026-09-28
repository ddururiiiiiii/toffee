import { BadRequestException } from '@nestjs/common';
import { appError } from '../common/i18n/app-error.js';

/**
 * "YYYY-MM-DD" → UTC 자정 Date. 달력에 없는 날짜(2월 31일 등)·미래·1900년 이전은 거절 —
 * new Date()는 2월 31일을 3월 3일로 조용히 넘겨버리고, 미래 날짜는 나이가 음수가 돼서 판정이 틀어짐.
 */
export function parseBirthDate(value: string, now = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const invalid = new BadRequestException(appError('BIRTH_DATE_INVALID'));
  if (!match) throw invalid;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw invalid;
  if (year < 1900 || date.getTime() > now.getTime()) throw invalid;
  return date;
}

/** 만 나이 — 생년월일은 UTC 자정으로 저장하므로 UTC 기준으로 계산(서버 시간대에 따라 하루 어긋나지 않게) */
export function calculateAge(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}
