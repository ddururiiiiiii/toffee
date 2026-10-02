import { describe, expect, it, vi } from 'vitest';
import { MediaService } from './media.service.js';
import type { StorageService } from './storage.service.js';

const PNG_HEAD = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

function setup(object: { sizeBytes: number; head: Uint8Array } | null) {
  const storage = {
    isConfigured: true,
    createUploadUrl: vi.fn().mockResolvedValue({ url: 'https://upload', expiresInSeconds: 600 }),
    head: vi.fn().mockResolvedValue(object && { sizeBytes: object.sizeBytes, contentType: 'image/png' }),
    readHead: vi.fn().mockResolvedValue(object?.head ?? new Uint8Array()),
    createReadUrl: vi.fn().mockResolvedValue('https://signed'),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return { media: new MediaService(storage as unknown as StorageService), storage };
}

describe('MediaService', () => {
  it('업로드 발급: 아티스트/용도별 경로에 확장자를 붙인 키를 만든다', async () => {
    const { media } = setup(null);
    const ticket = await media.createUpload('a1', 'message', 'PHOTO', 'image/png', 1000);
    expect(ticket.objectKey).toMatch(/^actors\/a1\/message\/[0-9a-f-]{36}\.png$/);
  });

  it('업로드 발급: 형식이 안 맞거나 너무 크면 거절', async () => {
    const { media } = setup(null);
    await expect(media.createUpload('a1', 'message', 'PHOTO', 'video/mp4', 1000)).rejects.toThrow('파일 형식');
    await expect(media.createUpload('a1', 'message', 'PHOTO', 'image/png', 21 * 1024 * 1024)).rejects.toThrow('너무 커요');
  });

  it('첨부 검증: 다른 아티스트/다른 용도/경로 조작 키는 저장소를 보지도 않고 거절', async () => {
    const { media, storage } = setup({ sizeBytes: 100, head: PNG_HEAD });
    for (const key of ['actors/a2/message/x.png', 'actors/a1/story/x.png', 'actors/a1/message/../../a2/message/x.png']) {
      await expect(media.verifyForAttach('a1', 'message', 'PHOTO', key)).rejects.toThrow();
    }
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('첨부 검증: 실제 내용이 형식과 다르면 거절하고 파일을 지운다', async () => {
    const { media, storage } = setup({ sizeBytes: 100, head: new TextEncoder().encode('not an image') });
    await expect(media.verifyForAttach('a1', 'message', 'PHOTO', 'actors/a1/message/x.jpg')).rejects.toThrow('형식과 달라요');
    expect(storage.delete).toHaveBeenCalledWith('actors/a1/message/x.jpg');
  });

  it('첨부 검증: 진짜 PNG면 통과, 영상으로 선언했으면 거절', async () => {
    const { media } = setup({ sizeBytes: 100, head: PNG_HEAD });
    await expect(media.verifyForAttach('a1', 'message', 'PHOTO', 'actors/a1/message/x.png')).resolves.toBeUndefined();
    await expect(media.verifyForAttach('a1', 'message', 'VIDEO', 'actors/a1/message/x.png')).rejects.toThrow('형식과 달라요');
  });

  it('조회 응답: mediaKey는 빼고 서명 URL로, 외부 URL만 있으면 그대로', async () => {
    const { media } = setup(null);
    expect(await media.withReadUrl({ id: 'm', mediaKey: 'k', mediaUrl: null })).toEqual({ id: 'm', mediaUrl: 'https://signed' });
    expect(await media.withReadUrl({ id: 'm', mediaKey: null, mediaUrl: 'https://x' })).toEqual({ id: 'm', mediaUrl: 'https://x' });
  });

  it('프로필 이미지: 외부 주소는 그대로, 저장소 키는 서명 URL, 없으면 null', async () => {
    const { media, storage } = setup(null);
    await expect(media.resolveImageUrl(null)).resolves.toBeNull();
    await expect(media.resolveImageUrl('https://placehold.co/a.png')).resolves.toBe('https://placehold.co/a.png');
    await expect(media.resolveImageUrl('actors/a1/profile/x.png')).resolves.toBe('https://signed');
    expect(storage.createReadUrl).toHaveBeenCalledWith('actors/a1/profile/x.png');
  });

  it('프로필 이미지: 다른 대상 경로의 키는 거절', async () => {
    const { media } = setup({ sizeBytes: 100, head: PNG_HEAD });
    await expect(media.verifyAt('actors/a1/profile/', 'PHOTO', 'actors/a1/message/x.png')).rejects.toThrow('이 용도로 올린 파일이 아니에요');
    await expect(media.verifyAt('actors/a1/profile/', 'PHOTO', 'actors/a1/profile/x.png')).resolves.toBeUndefined();
  });
});
