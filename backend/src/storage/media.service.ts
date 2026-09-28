import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { StorageService } from './storage.service.js';
import { extensionFor, isStorageKey, keyPrefix, MEDIA_RULES, type UploadableMediaType, type UploadPurpose } from './media-policy.js';

// file-type이 형식을 판별하는 데 필요한 앞부분 크기(라이브러리 권장값)
const SNIFF_BYTES = 4100;

interface HasMedia {
  mediaUrl: string | null;
  mediaKey: string | null;
  thumbnailKey?: string | null;
}

type WithReadUrl<T> = Omit<T, 'mediaKey' | 'thumbnailKey'> & { thumbnailUrl?: string | null };

/**
 * 업로드 흐름: ① createUpload로 임시 업로드 URL 발급 → ② 앱이 저장소에 직접 PUT →
 * ③ 메시지/스토리를 만들 때 objectKey를 넘기면 verifyForAttach로 "이 배우가 이 용도로 올린,
 * 선언한 형식·크기에 맞는 실제 파일인지" 확인 후 저장. 조회 응답에선 withReadUrl로 임시 URL로 바꿔줌.
 */
@Injectable()
export class MediaService {
  constructor(private readonly storage: StorageService) {}

  createUpload(actorId: string, purpose: UploadPurpose, mediaType: UploadableMediaType, contentType: string, sizeBytes: number) {
    return this.createUploadAt(keyPrefix(actorId, purpose), mediaType, contentType, sizeBytes);
  }

  verifyForAttach(actorId: string, purpose: UploadPurpose, mediaType: UploadableMediaType, objectKey: string): Promise<void> {
    return this.verifyAt(keyPrefix(actorId, purpose), mediaType, objectKey, '이 배우가 이 용도로 올린 파일이 아니에요.');
  }

  async createUploadAt(prefix: string, mediaType: UploadableMediaType, contentType: string, sizeBytes: number) {
    const rule = MEDIA_RULES[mediaType];
    if (!rule.declared.has(contentType)) {
      throw new BadRequestException(`${mediaType}로 올릴 수 없는 파일 형식이에요: ${contentType}`);
    }
    if (sizeBytes > rule.maxBytes) {
      throw new BadRequestException(`파일이 너무 커요(최대 ${Math.floor(rule.maxBytes / 1024 / 1024)}MB).`);
    }
    const objectKey = `${prefix}${randomUUID()}.${extensionFor(contentType)}`;
    const { url, expiresInSeconds } = await this.storage.createUploadUrl(objectKey, contentType, sizeBytes);
    return { objectKey, uploadUrl: url, method: 'PUT' as const, headers: { 'Content-Type': contentType }, expiresInSeconds };
  }

  async verifyAt(prefix: string, mediaType: UploadableMediaType, objectKey: string, wrongPlaceMessage: string): Promise<void> {
    if (!objectKey.startsWith(prefix) || objectKey.includes('..')) {
      throw new BadRequestException(wrongPlaceMessage);
    }
    const head = await this.storage.head(objectKey);
    if (!head) throw new BadRequestException('파일이 아직 업로드되지 않았어요.');

    const rule = MEDIA_RULES[mediaType];
    const detected = await fileTypeFromBuffer(await this.storage.readHead(objectKey, SNIFF_BYTES));
    const problem =
      head.sizeBytes > rule.maxBytes
        ? '파일이 너무 커요.'
        : !detected || !rule.detected.has(detected.mime)
          ? `실제 파일 형식이 ${mediaType}가 아니에요${detected ? `(${detected.mime})` : ''}.`
          : null;
    if (problem) {
      // 규칙에 안 맞는 파일은 남겨둘 이유가 없음 — 지우고 거절
      await this.storage.delete(objectKey).catch(() => {});
      throw new BadRequestException(problem);
    }
  }

  /** mediaKey(와 영상 썸네일 thumbnailKey)가 있으면 임시 조회 URL로 바꿔서 mediaUrl/thumbnailUrl에 넣고, 키는 응답에서 뺌 */
  async withReadUrl<T extends HasMedia>(item: T): Promise<WithReadUrl<T>> {
    const { mediaKey, thumbnailKey, ...rest } = item;
    const [mediaUrl, thumbnailUrl] = await Promise.all([
      mediaKey ? this.storage.createReadUrl(mediaKey) : Promise.resolve(rest.mediaUrl),
      thumbnailKey ? this.storage.createReadUrl(thumbnailKey) : Promise.resolve(null),
    ]);
    return { ...rest, mediaUrl, ...(thumbnailKey !== undefined ? { thumbnailUrl } : {}) };
  }

  withReadUrls<T extends HasMedia>(items: T[]): Promise<WithReadUrl<T>[]> {
    return Promise.all(items.map((item) => this.withReadUrl(item)));
  }

  /**
   * 프로필 이미지 필드 값 → 앱이 바로 쓸 수 있는 주소. 외부 주소는 그대로, 저장소 키는 임시 서명 URL
   * (1시간 단위로 같은 URL이라 목록을 다시 불러도 이미지 캐시가 유지됨). 저장소 미설정이면 null.
   */
  async resolveImageUrl(value: string | null): Promise<string | null> {
    if (!isStorageKey(value)) return value;
    if (!this.storage.isConfigured) return null;
    return this.storage.createReadUrl(value);
  }

  /** 삭제 실패는 호출한 쪽 흐름을 막지 않음(고아 파일은 나중에 정리) */
  async deleteQuietly(objectKey: string | null): Promise<void> {
    if (!objectKey || !this.storage.isConfigured) return;
    await this.storage.delete(objectKey).catch(() => {});
  }
}
