import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

/**
 * 음성 메시지 듣기 모드(2026-09-29) — 무음 모드여도 들리고, 화면을 끄거나 다른 앱으로 가도 이어서 재생(카톡처럼).
 * 녹음(스튜디오)이 끝나면 이 모드로 되돌림 — 부분 설정만 넘기면 나머지가 기본값으로 돌아가는 기기가 있어서 항상 전체를.
 */
export const PLAYBACK_AUDIO_MODE = {
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix',
  allowsRecording: false,
} as const;

export function applyPlaybackAudioMode(): void {
  if (Platform.OS === 'web') return;
  setAudioModeAsync(PLAYBACK_AUDIO_MODE).catch(() => {});
}
