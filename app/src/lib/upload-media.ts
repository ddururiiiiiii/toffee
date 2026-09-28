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
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  webm: 'audio/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

// 피커/녹음기가 형식을 안 알려주는 경우가 있어서 blob 형식 → 확장자 순으로 추정.
// "audio/webm;codecs=opus"처럼 붙는 파라미터는 떼야 서버 허용 목록과 맞음.
function resolveContentType(explicit: string | undefined, blob: Blob, uri: string): string {
  const fromBlob = blob.type || undefined;
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const type = explicit ?? fromBlob ?? CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
  return type.split(';')[0].trim();
}

async function putToStorage(path: string, body: Record<string, unknown>, uri: string, explicitType?: string): Promise<string> {
  const file = await (await fetch(uri)).blob();
  const contentType = resolveContentType(explicitType, file, uri);
  const ticket = await apiClient.post<UploadTicket>(path, { ...body, contentType, sizeBytes: file.size });
  const res = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file });
  if (!res.ok) throw new UploadError(`upload failed (${res.status})`);
  return ticket.objectKey;
}

export function uploadMedia(
  actorId: string,
  params: { purpose: UploadPurpose; mediaType: UploadMediaType; uri: string; contentType?: string },
): Promise<string> {
  return putToStorage(
    `/actors/${actorId}/uploads`,
    { purpose: params.purpose, mediaType: params.mediaType },
    params.uri,
    params.contentType,
  );
}

/** 운영자용 — 배우 프로필 사진·소속사 로고. 받은 키를 배우 이미지/소속사 수정 API에 넘김 */
export function uploadProfileImage(target: 'ACTOR' | 'AGENCY', targetId: string, uri: string, contentType?: string): Promise<string> {
  return putToStorage('/admin/uploads', { target, targetId }, uri, contentType);
}

/** 배우 본인·소속사 직원 — 대화방 사진. 받은 키를 PATCH /actors/:id/chat-profile-image에 넘김 */
export function uploadChatProfileImage(actorId: string, uri: string, contentType?: string): Promise<string> {
  return putToStorage(`/actors/${actorId}/chat-profile-image/upload`, {}, uri, contentType);
}
