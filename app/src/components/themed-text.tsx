import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Fonts, fontFor, type FontWeightValue, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 글자 크기 체계(디자인 가이드: 가독성·위계 우선, 태국어·영어가 모두 편하게 들어가게).
 * display 28 · title 22 · headline 17 · default 15 · small 13 · caption 12. 굵기는 fontFor(언어별 글꼴).
 */
export type ThemedTextProps = TextProps & {
  type?:
    | 'display'
    | 'title'
    | 'subtitle'
    | 'headline'
    | 'default'
    | 'defaultMedium'
    | 'defaultSemiBold'
    | 'small'
    | 'smallMedium'
    | 'smallBold'
    | 'caption'
    | 'captionBold'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

const WEIGHT: Record<NonNullable<ThemedTextProps['type']>, FontWeightValue> = {
  display: 700,
  title: 700,
  subtitle: 600,
  headline: 600,
  default: 400,
  defaultMedium: 500,
  defaultSemiBold: 600,
  small: 400,
  smallMedium: 500,
  smallBold: 600,
  caption: 400,
  captionBold: 600,
  link: 500,
  linkPrimary: 600,
  code: 400,
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  // 호출하는 쪽이 fontWeight를 따로 주면 그 굵기로
  const override = StyleSheet.flatten(style)?.fontWeight;
  const weight = override !== undefined ? toWeight(override) : WEIGHT[type];
  return (
    <Text
      style={[
        styles[type],
        { color: type === 'linkPrimary' ? theme.tint : theme[themeColor ?? 'text'] },
        style,
        type === 'code' ? null : fontFor(weight, i18n.language),
      ]}
      {...rest}
    />
  );
}

function toWeight(weight: TextStyle['fontWeight']): FontWeightValue {
  const value = Number(weight === 'bold' ? 700 : weight === 'normal' ? 400 : weight);
  return value >= 700 ? 700 : value >= 600 ? 600 : value >= 500 ? 500 : 400;
}

const f = (fontSize: number, lineHeight: number, extra: TextStyle = {}): TextStyle => ({ fontSize, lineHeight, ...extra });

const styles = StyleSheet.create({
  display: f(28, 36, { letterSpacing: -0.4 }),
  title: f(22, 30, { letterSpacing: -0.2 }),
  subtitle: f(19, 26, { letterSpacing: -0.1 }),
  headline: f(17, 24),
  default: f(15, 22),
  defaultMedium: f(15, 22),
  defaultSemiBold: f(15, 22),
  small: f(13, 18),
  smallMedium: f(13, 18),
  smallBold: f(13, 18),
  caption: f(12, 16),
  captionBold: f(12, 16),
  link: f(14, 20),
  linkPrimary: f(14, 20),
  code: { fontFamily: Fonts.mono, fontSize: 12 },
});
