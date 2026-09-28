import type { LucideIcon, LucideProps } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import type { ThemeColor } from '@/constants/theme';

/**
 * 선형 아이콘(Lucide) — 가이드: 단순하고 굵기가 일정한 선, 장식·귀여운 일러스트 금지. 이모지 아이콘 대신 이걸 씀.
 * 사용: <Icon as={Search} /> — 기본 22px, 선 1.75, 글자색.
 */
export function Icon({ as: Component, size = 22, color, themeColor, strokeWidth = 1.75, ...rest }: LucideProps & {
  as: LucideIcon;
  themeColor?: ThemeColor;
}) {
  const theme = useTheme();
  return <Component size={size} color={color ?? theme[themeColor ?? 'text']} strokeWidth={strokeWidth} {...rest} />;
}
