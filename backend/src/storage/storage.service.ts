import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { appError } from '../common/i18n/app-error.js';

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
// 조회용 서명 URL: 1시간 단위로 서명 시각을 맞춰서 같은 시간대엔 URL이 똑같게 함 — 채팅방이 폴링할
// 때마다 URL이 바뀌면 앱이 이미지를 매번 새로 받음(캐시 무효). 유효기간 2시간이라 최소 1시간은 보장.
const READ_URL_WINDOW_MS = 60 * 60 * 1000;
const READ_URL_TTL_SECONDS = 2 * 60 * 60;

/**
 * S3 호환 오브젝트 스토리지(운영: Cloudflare R2 예정, 로컬: MinIO/moto 등) 래퍼.
 * 버킷은 비공개로 두고, 올리기/보기 모두 서버가 권한 확인 후 발급하는 임시 서명 URL로만 접근.
 * STORAGE_* 환경변수가 없으면 업로드 관련 요청은 503 — IAP처럼 조용히 넘어가지 않음.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('STORAGE_ENDPOINT');
    const bucket = config.get<string>('STORAGE_BUCKET');
    const accessKeyId = config.get<string>('STORAGE_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('STORAGE_SECRET_ACCESS_KEY');
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      this.client = null;
      this.bucket = null;
      return;
    }
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region: config.get<string>('STORAGE_REGION') || 'auto',
      credentials: { accessKeyId, secretAccessKey },
      // R2는 가상 호스트/경로 방식 둘 다 되지만 MinIO/moto 같은 로컬 서버는 경로 방식이 필요
      forcePathStyle: config.get<string>('STORAGE_FORCE_PATH_STYLE') === 'true',
    });
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  private require(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(appError('STORAGE_NOT_CONFIGURED'));
    }
    return { client: this.client, bucket: this.bucket };
  }

  // Content-Type/Content-Length까지 서명에 넣어서 발급받은 것과 다른 형식·크기로는 못 올리게 함
  // (저장소가 이걸 강제하지 않아도 첨부 시점에 HEAD로 다시 확인함)
  async createUploadUrl(key: string, contentType: string, sizeBytes: number) {
    const { client, bucket } = this.require();
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return { url, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
  }

  /** 객체가 없으면 null */
  async head(key: string): Promise<{ sizeBytes: number; contentType: string | undefined } | null> {
    const { client, bucket } = this.require();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  /** 파일 형식 판별용으로 앞부분만 읽음 */
  async readHead(key: string, bytes: number): Promise<Uint8Array> {
    const { client, bucket } = this.require();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  }

  async createReadUrl(key: string, now = Date.now()): Promise<string> {
    const { client, bucket } = this.require();
    const signingDate = new Date(Math.floor(now / READ_URL_WINDOW_MS) * READ_URL_WINDOW_MS);
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: READ_URL_TTL_SECONDS,
      signingDate,
    });
  }

  async delete(key: string): Promise<void> {
    const { client, bucket } = this.require();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  /** prefix 아래 객체를 전부(1000개씩 이어서) — 고아 파일 정리용 */
  async *listObjects(prefix: string): AsyncGenerator<{ key: string; lastModified: Date }> {
    const { client, bucket } = this.require();
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
      for (const object of page.Contents ?? []) {
        if (object.Key && object.LastModified) yield { key: object.Key, lastModified: object.LastModified };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}
