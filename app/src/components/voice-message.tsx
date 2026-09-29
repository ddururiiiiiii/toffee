import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Download, Pause, Play } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { fallbackWaveform, formatDuration, resample } from '@/lib/waveform';

const BAR_COUNT = 32;

// 한 번에 하나만 재생(카톡처럼) — 다른 음성을 누르면 재생 중이던 것을 멈춤
let pauseActive: (() => void) | null = null;
// 이어 듣기(2026-09-29): 화면에 있는 음성 메시지마다 "처음부터 재생" 함수를 등록해 두고, 하나가 끝나면 nextId를 재생
const starters = new Map<string, () => void>();

interface Props {
  id: string;
  url: string | null;
  durationMs?: number | null;
  waveform?: number[] | null;
  /** 말풍선 배경이 진한 색(내가 보낸 쪽)이면 'light' — 막대·글자를 흰색 계열로 */
  tone: 'light' | 'dark';
  /** 있으면 끝에 ⤓(저장) 버튼 — 음성은 크게 보기 화면이 없어서 말풍선에서 바로 저장 */
  onSave?: () => void;
  /** 이 음성이 끝나면 이어서 재생할 다음(더 최신) 음성 메시지 id */
  nextId?: string;
}

/** 카톡식 음성 메시지 — ▶ 버튼 + 음파 막대(재생된 부분은 진하게) + 길이 */
export function VoiceMessage({ id, url, durationMs, waveform, tone, onSave, nextId }: Props) {
  // 목록에 음성이 많아도 누르기 전엔 파일을 받지 않도록 빈 플레이어로 시작해서 처음 재생할 때 연결
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loadedUrl = useRef<string | null>(null);

  const bars = useMemo(
    () => (waveform && waveform.length > 0 ? resample(waveform, BAR_COUNT) : fallbackWaveform(id, BAR_COUNT)),
    [id, waveform],
  );

  // 렌더마다 새 함수가 되면 "지금 재생 중인 게 나인지" 비교가 깨져서 고정(player는 안 바뀜)
  const stop = useCallback(() => player.pause(), [player]);
  useEffect(
    () => () => {
      if (pauseActive === stop) pauseActive = null;
    },
    [stop],
  );

  const start = useCallback(() => {
    if (!url) return;
    if (pauseActive && pauseActive !== stop) pauseActive();
    pauseActive = stop;
    // 서명 URL은 시간이 지나면 바뀌므로 달라졌으면 다시 연결
    if (loadedUrl.current !== url) {
      player.replace({ uri: url });
      loadedUrl.current = url;
    }
    player.play();
  }, [player, stop, url]);

  useEffect(() => {
    starters.set(id, start);
    return () => {
      if (starters.get(id) === start) starters.delete(id);
    };
  }, [id, start]);

  // 끝나면 처음으로 되감고, 다음 음성이 화면에 있으면 이어서 재생
  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    void player.seekTo(0);
    if (nextId) starters.get(nextId)?.();
  }, [status.didJustFinish, player, nextId]);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    start();
  };

  const total = status.duration > 0 ? status.duration : (durationMs ?? 0) / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  // 2A 시안: 라벤더 재생 버튼 + 라벤더 음파(재생된 부분은 진하게)
  const strong = tone === 'light' ? '#fff' : '#7C8CFF';
  const weak = tone === 'light' ? 'rgba(255,255,255,0.45)' : 'rgba(124,140,255,0.35)';
  const label = tone === 'light' ? '#fff' : '#3A3D4A';
  const loading = status.playing && !status.isLoaded;

  // 재생 영역과 저장 버튼은 형제로 둠 — 버튼 안에 버튼을 넣으면 웹에서 <button> 중첩 오류
  return (
    <View style={styles.container}>
      <Pressable onPress={toggle} style={styles.row} accessibilityRole="button" disabled={!url}>
        <View style={[styles.playButton, { backgroundColor: tone === 'light' ? 'rgba(255,255,255,0.25)' : 'rgba(124,140,255,0.16)' }]}>
          {loading ? (
            <ActivityIndicator size="small" color={strong} />
          ) : status.playing ? (
            <Pause size={16} color={strong} fill={strong} />
          ) : (
            <Play size={16} color={strong} fill={strong} style={styles.playIcon} />
          )}
        </View>
        <View style={styles.bars}>
          {bars.map((level, index) => (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height: 4 + level * 20,
                  backgroundColor: index / BAR_COUNT < progress ? strong : weak,
                },
              ]}
            />
          ))}
        </View>
        <ThemedText type="small" style={[styles.time, { color: label }]}>
          {formatDuration(status.playing || status.currentTime > 0 ? total - status.currentTime : total)}
        </ThemedText>
      </Pressable>
      {onSave && url ? (
        <Pressable onPress={onSave} hitSlop={10} accessibilityRole="button" accessibilityLabel="save">
          <Download size={18} color={label} strokeWidth={1.75} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { marginLeft: 2 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 26 },
  bar: { width: 3, borderRadius: 2 },
  time: { minWidth: 34, fontVariant: ['tabular-nums'] },
});
