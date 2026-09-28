// 웹용 — 실제 네이티브 구현은 video-thumbnail.native.ts. 두 파일의 내보내는 모양을 똑같이 유지할 것.
// expo-video-thumbnails는 웹을 지원하지 않아서 <video>로 첫 장면을 띄운 뒤 canvas로 캡처함.

const TIMEOUT_MS = 10000;
const MAX_WIDTH = 640;

/**
 * 영상의 첫 장면을 JPEG로 뽑아 blob: 주소를 돌려줌. 실패하면 null — 썸네일은 선택이라
 * 못 만들어도 영상 발송은 그대로 진행(앱이 어두운 타일 + ▶로 대신 표시).
 */
export function createVideoThumbnail(videoUri: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    // 0초 지점은 검은 화면인 경우가 있어서 아주 조금 뒤로 이동한 뒤 캡처
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      const scale = Math.min(1, MAX_WIDTH / (video.videoWidth || MAX_WIDTH));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) return finish(null);
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.7);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    video.src = videoUri;
  });
}
