import { useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
// 아래(또는 위)로 이만큼 끌거나 빠르게 튕기면 닫힘(카톡·인스타처럼)
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * 전체 화면 사진 한 장 — 두 손가락으로 확대/축소, 두 번 탭하면 확대↔원래대로, 확대된 동안은 끌어서 이동,
 * 확대 안 된 상태에서 위아래로 끌면 닫기(dismissProgress 0~1로 배경을 같이 흐리게). 좌우 넘기기는 바깥 목록이 맡고,
 * 확대 중엔 onZoomChange(true)로 바깥 목록 넘기기를 막음.
 */
export function ZoomablePage({
  width,
  height,
  children,
  zoomEnabled = true,
  dismissProgress,
  onZoomChange,
  onDismiss,
}: {
  width: number;
  height: number;
  children: ReactNode;
  /** 영상처럼 확대하지 않는 페이지는 false(닫기 끌기만) */
  zoomEnabled?: boolean;
  dismissProgress: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onDismiss: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const setZoom = (value: boolean) => {
    setZoomed(value);
    onZoomChange(value);
  };

  // 확대된 만큼만 끌 수 있게(사진 밖 빈 곳이 보이지 않게)
  const clamp = (value: number, s: number, size: number) => {
    'worklet';
    const limit = ((s - 1) * size) / 2;
    return Math.min(limit, Math.max(-limit, value));
  };

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
    scheduleOnRN(setZoom, false);
  };

  const pinch = Gesture.Pinch()
    .enabled(zoomEnabled)
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * event.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        reset();
        return;
      }
      savedScale.value = scale.value;
      x.value = withTiming(clamp(x.value, scale.value, width));
      y.value = withTiming(clamp(y.value, scale.value, height));
      savedX.value = clamp(x.value, scale.value, width);
      savedY.value = clamp(y.value, scale.value, height);
      scheduleOnRN(setZoom, true);
    });

  const doubleTap = Gesture.Tap()
    .enabled(zoomEnabled)
    .numberOfTaps(2)
    .onEnd((event) => {
      if (savedScale.value > 1) {
        reset();
        return;
      }
      // 두 번 탭한 곳을 중심으로 확대
      const nextX = clamp((width / 2 - event.x) * (DOUBLE_TAP_SCALE - 1), DOUBLE_TAP_SCALE, width);
      const nextY = clamp((height / 2 - event.y) * (DOUBLE_TAP_SCALE - 1), DOUBLE_TAP_SCALE, height);
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      savedScale.value = DOUBLE_TAP_SCALE;
      x.value = withTiming(nextX);
      y.value = withTiming(nextY);
      savedX.value = nextX;
      savedY.value = nextY;
      scheduleOnRN(setZoom, true);
    });

  // 확대 중: 사방으로 이동. 확대 안 됨: 위아래 끌기만(좌우는 바깥 목록 넘기기에 양보)
  const pan = zoomed
    ? Gesture.Pan()
        .onUpdate((event) => {
          x.value = clamp(savedX.value + event.translationX, scale.value, width);
          y.value = clamp(savedY.value + event.translationY, scale.value, height);
        })
        .onEnd(() => {
          savedX.value = x.value;
          savedY.value = y.value;
        })
    : Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-12, 12])
        .onUpdate((event) => {
          y.value = event.translationY;
          dismissProgress.set(Math.min(1, Math.abs(event.translationY) / (DISMISS_DISTANCE * 2)));
        })
        .onEnd((event) => {
          if (Math.abs(event.translationY) > DISMISS_DISTANCE || Math.abs(event.velocityY) > DISMISS_VELOCITY) {
            scheduleOnRN(onDismiss);
            return;
          }
          y.value = withSpring(0);
          dismissProgress.set(withTiming(0));
        });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[styles.page, { width, height }]}>
        <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: { overflow: 'hidden' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
