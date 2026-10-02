import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * 사진이 없을 때의 기본 프로필(2026-10-02, 카톡처럼 사람 모양) — 연보라(tintSoft) 바탕에 흰 실루엣(다크 모드는 옅은 라벤더).
 * 선 아이콘 대신 꽉 찬 실루엣이라 작게 써도 깔끔함. 바탕까지 그리므로 부모에서 모양(원·둥근 사각)만 잘라 주면 됨.
 * 정사각이 아닌 곳(배우 찾기 사진 카드)은 아래쪽에 맞춰 그림.
 */
export function PersonFigure({ width, height = width }: { width: number; height?: number }) {
  const theme = useTheme();
  return (
    <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" style={{ backgroundColor: theme.tintSoft }}>
      <Circle cx={50} cy={39} r={17} fill={theme.avatarFigure} />
      <Path d="M16 100 C16 75 31 63 50 63 C69 63 84 75 84 100 Z" fill={theme.avatarFigure} />
    </Svg>
  );
}
