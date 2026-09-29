import { Image } from 'expo-image';

/**
 * 사진(또는 영상 첫 장면)의 흐린 미리보기 값(ThumbHash, 30자 안팎) — 올릴 때 한 번 계산해서 메시지와 같이 보내고,
 * 팬 화면은 사진을 받는 동안 이걸 흐리게 그려 줌(2026-09-29). 웹 등 계산이 안 되는 환경이면 없이 보냄(빈 배경).
 */
export async function thumbhashFor(uri: string | undefined): Promise<string | undefined> {
  if (!uri) return undefined;
  try {
    const hash = await Image.generateThumbhashAsync(uri);
    return hash && hash.length <= 100 ? hash : undefined;
  } catch {
    return undefined;
  }
}
