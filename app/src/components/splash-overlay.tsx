import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

// 네이티브 스플래시(app.config.ts expo-splash-screen: 흰/차콜 배경 + T Spark)와 똑같은 화면을 한 번 더 그려 두고,
// 첫 화면이 준비되면 네이티브 스플래시를 내린 뒤 이 화면을 살짝 흐려지며 사라지게 — 뚝 끊기는 전환을 막음.
// (예전엔 Expo 템플릿의 파란 화면 + Expo 로고 애니메이션이 그대로 남아 있었음)
const ICON_WIDTH = 96;
const ICON_ASPECT = 765 / 735;

export function SplashOverlay() {
  const dark = useColorScheme() === 'dark';
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <Animated.View
      exiting={FadeOut.duration(250)}
      style={[styles.overlay, { backgroundColor: dark ? '#0F1115' : '#FFFFFF' }]}
      onLayout={() => {
        if (ready) return;
        setReady(true);
        void SplashScreen.hideAsync().finally(() => setTimeout(() => setVisible(false), 150));
      }}>
      <Image
        source={dark ? require('@/../assets/images/splash-icon-dark.png') : require('@/../assets/images/splash-icon.png')}
        style={{ width: ICON_WIDTH, height: ICON_WIDTH * ICON_ASPECT }}
        contentFit="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
});
