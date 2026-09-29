import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessageSenderType, Role } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { appError } from '../common/i18n/app-error.js';
import type { SupportedLocale } from '../common/i18n/locales.js';
import { ensureActiveSubscription } from '../common/authorization/ensure-active-subscription.js';
import { ensureCanViewActor } from '../common/authorization/actor-access.js';
import { ClaudeTranslationProvider, FakeTranslationProvider, TranslationRefusedError, type TranslationProvider } from './translation-provider.js';

const NAME_PLACEHOLDER = '{{name}}';
const DEFAULT_MODEL = 'claude-opus-5-5';

/**
 * 메시지 번역(2026-09-29, 사용자 결정: 글로벌 서비스라 필수). 누가 번역 버튼을 누를 때만(지연 번역), 메시지 × 언어마다 한 번 번역해서
 * MessageTranslation에 저장 — 같은 메시지를 다른 팬이 같은 언어로 눌러도 다시 번역하지 않음(비용은 메시지당 한 번). 스타 메시지의 {{name}}은
 * 그대로 번역해 두고 보여 줄 때 그 팬 이름으로.
 * 누가 볼 수 있나: 팬은 채팅방에서 보이는 것(구독 시작 이후 스타 메시지 + 내 답장), 스타·소속사·운영자는 그 방의 메시지(팬 답장 포함 —
 * 태국·일본 팬 답장을 배우가 읽을 수 있게).
 * 엔진: TRANSLATION_PROVIDER(claude | fake | off). 비워 두면 ANTHROPIC_API_KEY가 있으면 claude, 없으면 개발은 가짜·운영은 꺼짐.
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly provider: TranslationProvider | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.provider = TranslationService.pickProvider(config);
    this.logger.log(`번역 엔진: ${this.provider?.name ?? '꺼짐'}`);
  }

  static pickProvider(config: ConfigService): TranslationProvider | null {
    const choice = config.get<string>('TRANSLATION_PROVIDER');
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    const model = config.get<string>('TRANSLATION_MODEL') || DEFAULT_MODEL;
    if (choice === 'off') return null;
    if (choice === 'fake') return new FakeTranslationProvider();
    if (choice === 'claude' || (!choice && apiKey)) return apiKey ? new ClaudeTranslationProvider(apiKey, model) : null;
    return config.get<string>('NODE_ENV') === 'production' ? null : new FakeTranslationProvider();
  }

  get enabled() {
    return !!this.provider;
  }

  async translateMessage(requesterId: string, actorId: string, messageId: string, target: SupportedLocale) {
    if (!this.provider) throw new ServiceUnavailableException(appError('TRANSLATION_UNAVAILABLE'));
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, actorId, deletedAt: null },
      select: { id: true, body: true, senderType: true, fanUserId: true, createdAt: true },
    });
    if (!message?.body) throw new NotFoundException(appError('MESSAGE_NOT_FOUND'));

    const requester = await this.prisma.user.findUniqueOrThrow({
      where: { id: requesterId },
      select: { role: true, nickname: true, displayName: true },
    });
    if (requester.role === Role.USER) {
      // 팬은 자기 채팅방에 보이는 메시지만(다른 팬 답장·구독 전 메시지는 안 보이므로 번역도 불가 — 있는지조차 알려 주지 않게 404)
      const subscription = await ensureActiveSubscription(this.prisma, requesterId, actorId);
      const visible = message.createdAt >= subscription.startedAt && (message.senderType === MessageSenderType.ARTIST || message.fanUserId === requesterId);
      if (!visible) throw new NotFoundException(appError('MESSAGE_NOT_FOUND'));
    } else {
      await ensureCanViewActor(this.prisma, requesterId, actorId);
    }

    let text = await this.cachedOrTranslate(message.id, message.body, target);
    // 팬에게 보여 줄 스타 메시지는 {{name}} 자리에 그 팬 이름(채팅방 원문과 같게)
    if (message.senderType === MessageSenderType.ARTIST && requester.role === Role.USER) {
      text = text.replaceAll(NAME_PLACEHOLDER, requester.nickname ?? requester.displayName ?? '');
    }
    return { messageId: message.id, language: target, text };
  }

  private async cachedOrTranslate(messageId: string, body: string, target: SupportedLocale): Promise<string> {
    const provider = this.provider!;
    if (provider.cacheable) {
      const cached = await this.prisma.messageTranslation.findUnique({ where: { messageId_languageCode: { messageId, languageCode: target } } });
      if (cached) return cached.translatedText;
    }
    let translated: string;
    try {
      translated = await provider.translate(body, target);
    } catch (error) {
      this.logger.warn(`번역 실패(${provider.name}): ${error instanceof TranslationRefusedError ? `거절 ${error.message}` : String(error)}`);
      throw new ServiceUnavailableException(appError('TRANSLATION_FAILED'));
    }
    if (!provider.cacheable) return translated;
    try {
      await this.prisma.messageTranslation.create({ data: { messageId, languageCode: target, translatedText: translated } });
    } catch (error) {
      // 두 사람이 동시에 눌러 먼저 저장된 게 있으면 그걸 씀
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      const saved = await this.prisma.messageTranslation.findUniqueOrThrow({ where: { messageId_languageCode: { messageId, languageCode: target } } });
      return saved.translatedText;
    }
    return translated;
  }
}
