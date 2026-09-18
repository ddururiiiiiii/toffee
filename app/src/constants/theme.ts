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
    tint: '#7C8CFF',
    tintSoft: '#DCE1FF',
    danger: '#E5484D',
  },
  dark: {
    text: '#ffffff',
    background: '#0F1115',
    backgroundElement: '#1A1C22',
    backgroundSelected: '#33365E',
    textSecondary: '#A0A3AD',
    tint: '#7C8CFF',
    tintSoft: '#262A47',
    danger: '#FF6369',
  },
} as const;

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
