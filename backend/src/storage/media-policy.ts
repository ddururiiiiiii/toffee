import { MessageMediaType } from '../generated/prisma/enums.js';

export type UploadableMediaType = Exclude<MessageMediaType, 'TEXT'>;

interface MediaRule {
  /** 클라이언트가 선언할 수 있는 Content-Type */
  declared: ReadonlySet<string>;
  /** 실제 파일 앞부분(매직 넘버)으로 판별한 형식 — file-type 결과 */
  detected: ReadonlySet<string>;
  maxBytes: number;
}

const MB = 1024 * 1024;

// 용량 한도는 파일럿 기준 잠정값 — 스타 앱 화면에서 영상 압축을 붙인 뒤 실제 크기를 보고 조정.
// 음성은 m4a/aac가 mp4 컨테이너라 file-type이 video/mp4로 판별하기도 해서 detected에 포함.
export const MEDIA_RULES: Record<UploadableMediaType, MediaRule> = {
  PHOTO: {
    declared: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
    detected: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
    maxBytes: 20 * MB,
  },
  AUDIO: {
    declared: new Set(['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg']),
    detected: new Set(['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'video/mp4', 'video/webm']),
    maxBytes: 30 * MB,
  },
  VIDEO: {
    declared: new Set(['video/mp4', 'video/quicktime', 'video/webm']),
    detected: new Set(['video/mp4', 'video/quicktime', 'video/webm']),
    maxBytes: 200 * MB,
  },
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function extensionFor(contentType: string): string {
  return EXTENSIONS[contentType] ?? 'bin';
}

// 업로드 용도 — 객체 키 경로에 들어가서, 첨부할 때 "이 배우의 이 용도로 올린 파일"인지 확인하는 데 씀.
// 게시판/CP방이 생기면 여기에 추가.
export const UPLOAD_PURPOSES = ['message', 'story'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export function keyPrefix(actorId: string, purpose: UploadPurpose): string {
  return `actors/${actorId}/${purpose}/`;
}

// 운영자가 올리는 프로필 이미지(배우 공식·대화방 프로필, 소속사 로고) — 메시지 파일과 경로를 나눠서
// 첨부 시 "이 대상의 프로필용으로 올린 파일"인지 확인
export const PROFILE_IMAGE_TARGETS = ['ACTOR', 'AGENCY'] as const;
export type ProfileImageTarget = (typeof PROFILE_IMAGE_TARGETS)[number];

export function profileImagePrefix(target: ProfileImageTarget, id: string): string {
  return target === 'ACTOR' ? `actors/${id}/profile/` : `agencies/${id}/logo/`;
}

// 이미지 필드(Actor.*ProfileImageUrl, Agency.logoUrl)엔 외부 주소(http…, 데모 데이터) 또는 저장소 키가
// 들어감 — 저장소 키면 조회할 때 임시 서명 URL로 바꿔서 내려줌(버킷은 계속 비공개)
export function isStorageKey(value: string | null | undefined): value is string {
  return !!value && !/^https?:\/\//i.test(value);
}
