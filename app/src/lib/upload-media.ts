import { apiClient } from '@/lib/api-client';

export type UploadPurpose = 'message' | 'story';
export type UploadMediaType = 'PHOTO' | 'AUDIO' | 'VIDEO';

interface UploadTicket {
  objectKey: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export class UploadError extends Error {}

/**
 * 배우가 사진·음성·영상을 올리는 공통 경로: ① 서버에 업로드 URL 발급 요청(형식·용량 검사) →
 * ② 저장소에 직접 PUT(서버를 거치지 않아 큰 영상도 부담 없음) → ③ 받은 objectKey를 메시지/스토리
 * 생성 API에 mediaKey로 넘기면 서버가 실제 파일을 다시 검사한 뒤 붙임.
 * uri는 이미지 피커/녹음기가 준 로컬 파일 주소(네이티브 file://, 웹 blob:) 그대로.
 */
export async function uploadMedia(
  actorId: string,
  params: { purpose: UploadPurpose; mediaType: UploadMediaType; uri: string; contentType: string },
): Promise<string> {
  const file = await (await fetch(params.uri)).blob();
  const ticket = await apiClient.post<UploadTicket>(`/actors/${actorId}/uploads`, {
    purpose: params.purpose,
    mediaType: params.mediaType,
    contentType: params.contentType,
    sizeBytes: file.size,
  });
  const res = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file });
  if (!res.ok) throw new UploadError(`upload failed (${res.status})`);
  return ticket.objectKey;
}
