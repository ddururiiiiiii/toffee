/**
 * Toffee 브랜드 팔레트 (docs/brand/DESIGN_GUIDE.md, docs/brand/exploration/*-brand-board-*.png 기준).
 * White + Charcoal(near-black) + Lavender accent — 브라운/캐러멜 계열로 재해석하지 말 것.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F1115',
    background: '#ffffff',
    backgroundElement: '#F4F6FB',
    backgroundSelected: '#DCE1FF',
    textSecondary: '#6B6F7A',
    // 시간·보조 정보처럼 한 단계 더 약한 글자
    textTertiary: '#9A9EA8',
    // 카드·목록 구분선 — Cloud보다 한 톤 진한 중립색(새 라벤더 계열을 만들지 않음)
    border: '#E9ECF3',
    tint: '#7C8CFF',
    tintSoft: '#DCE1FF',
    // 기본 버튼(Charcoal) — 브랜드 보드의 검정 CTA
    primary: '#0F1115',
    onPrimary: '#ffffff',
    danger: '#E5484D',
  },
  dark: {
    text: '#ffffff',
    background: '#0F1115',
    backgroundElement: '#1A1C22',
    backgroundSelected: '#33365E',
    textSecondary: '#A0A3AD',
    textTertiary: '#6E727C',
    border: '#262A33',
    tint: '#7C8CFF',
    tintSoft: '#262A47',
    primary: '#ffffff',
    onPrimary: '#0F1115',
    danger: '#FF6369',
  },
} as const;

/** 모서리 — 가이드: "restrained radius", 사탕처럼 둥글게 하지 말 것 */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * 글꼴 굵기별 파일 — 커스텀 글꼴은 안드로이드에서 fontWeight만으로는 굵어지지 않아서 굵기마다 다른 파일을 씀
 * (예전엔 Regular 하나만 불러서 굵은 글씨가 전부 보통 굵기로 보였음).
 */
export const FontFamily = {
  regular: 'NotoSansThai_400Regular',
  medium: 'NotoSansThai_500Medium',
  semibold: 'NotoSansThai_600SemiBold',
  bold: 'NotoSansThai_700Bold',
} as const;

export type FontWeightValue = 400 | 500 | 600 | 700;
const FAMILY_BY_WEIGHT: Record<FontWeightValue, string> = {
  400: FontFamily.regular,
  500: FontFamily.medium,
  600: FontFamily.semibold,
  700: FontFamily.bold,
};
// Noto Sans Thai(가이드 확정 글꼴)엔 한글·가나·한자가 없음 — 그 언어들은 기기 기본 글꼴의 굵기를 씀(한글 글꼴 파일을
// 넣으면 앱이 20MB 넘게 커져서). 웹은 글꼴 목록으로 섞어 쓸 수 있어서 태국어·영문은 Noto, 나머지는 시스템 글꼴로.
const CJK_LANGUAGES = new Set(['ko', 'ja', 'zh-Hans', 'zh-Hant']);
const WEB_FALLBACK = "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Hiragino Sans', 'PingFang SC', sans-serif";

/** 굵기 + 앱 언어 → 글꼴 스타일(Text·TextInput 공통) */
export function fontFor(weight: FontWeightValue, language: string): { fontFamily?: string; fontWeight: TextWeight } {
  const fontWeight = String(weight) as TextWeight;
  if (Platform.OS === 'web') return { fontFamily: `${FAMILY_BY_WEIGHT[weight]}, ${WEB_FALLBACK}`, fontWeight };
  if (CJK_LANGUAGES.has(language)) return { fontFamily: undefined, fontWeight };
  return { fontFamily: FAMILY_BY_WEIGHT[weight], fontWeight: 'normal' };
}
type TextWeight = 'normal' | '400' | '500' | '600' | '700';

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'NotoSansThai_400Regular',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'NotoSansThai_400Regular',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
