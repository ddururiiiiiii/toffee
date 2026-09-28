import * as VideoThumbnails from 'expo-video-thumbnails';

// 네이티브용 — 웹 구현은 video-thumbnail.ts. 두 파일의 내보내는 모양을 똑같이 유지할 것.

/**
 * 영상의 첫 장면을 JPEG로 뽑아 로컬 파일 주소를 돌려줌. 실패하면 null — 썸네일은 선택이라
 * 못 만들어도 영상 발송은 그대로 진행(앱이 어두운 타일 + ▶로 대신 표시).
 */
export async function createVideoThumbnail(videoUri: string): Promise<string | null> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality: 0.7 });
    return uri;
  } catch {
    return null;
  }
}
