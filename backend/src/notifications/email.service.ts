import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RESEND_API_URL = 'https://api.resend.com/emails';

// 법정대리인 동의 메일처럼 "반드시 실제로 발송돼야 하는" 메일 전용 — FCM 푸시와 달리
// 설정이 없다고 조용히 무시하면 안 되는 안전 게이트라서 실패 시 에러를 던짐.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    const from = this.configService.getOrThrow<string>('EMAIL_FROM_ADDRESS');

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      this.logger.error(`이메일 발송 실패 (${res.status}): ${await res.text().catch(() => '')}`);
      throw new InternalServerErrorException('이메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  }
}
