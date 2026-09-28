import { Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appError } from '../common/i18n/app-error.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

// 법정대리인 동의 메일처럼 "반드시 실제로 발송돼야 하는" 메일 전용 — FCM 푸시와 달리
// 설정이 없다고 조용히 무시하면 안 되는 안전 게이트라서 실패 시 에러를 던짐(운영). 개발 환경에서 키가 없으면 로그로 대신.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('EMAIL_FROM_ADDRESS');
    if (!apiKey || !from) {
      // 개발 환경: 메일 계정(Resend)은 인프라 작업 때 만들기로 해서(ops-infra-backlog) 그 전엔 서버 로그로 대신 —
      // 동의 링크를 로그에서 복사해 열면 흐름 끝까지 테스트 가능. 운영에서 설정이 빠졌으면 조용히 넘기지 않고 503.
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException(appError('EMAIL_NOT_CONFIGURED'));
      }
      this.logger.warn(`[메일 미설정 — 발송 대신 로그] to=${to} subject=${subject}\n${html}`);
      return;
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      this.logger.error(`이메일 발송 실패 (${res.status}): ${await res.text().catch(() => '')}`);
      throw new InternalServerErrorException(appError('EMAIL_SEND_FAILED'));
    }
  }
}
