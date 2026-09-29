import { describe, expect, it } from 'vitest';
import { TranslationService } from './translation.service.js';
import { FakeTranslationProvider, TRANSLATION_SYSTEM_PROMPT, type TranslationProvider } from './translation-provider.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';

const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

function setup(provider: TranslationProvider | null, role: 'USER' | 'ACTOR' = 'USER') {
  const saved = new Map<string, string>();
  const calls: string[] = [];
  const messages = [
    { id: 'm1', actorId: 'a1', body: '{{name}}야 오늘 하루 어땠어?', senderType: 'ARTIST', fanUserId: null, createdAt: new Date('2026-09-10'), deletedAt: null },
    { id: 'm-other-fan', actorId: 'a1', body: '다른 팬 답장', senderType: 'FAN', fanUserId: 'other', createdAt: new Date('2026-09-10'), deletedAt: null },
    { id: 'm-old', actorId: 'a1', body: '구독 전 메시지', senderType: 'ARTIST', fanUserId: null, createdAt: new Date('2026-08-01'), deletedAt: null },
  ];
  const db = {
    message: { findFirst: async ({ where }: { where: { id: string; actorId: string } }) => messages.find((m) => m.id === where.id && m.actorId === where.actorId) ?? null },
    user: { findUniqueOrThrow: async () => ({ role, nickname: '캐러멜바라기', displayName: '민지' }) },
    subscription: { findUnique: async () => ({ startedAt: new Date('2026-09-01'), cancelledAt: null }) },
    actor: { findFirst: async () => ({ id: 'a1' }) },
    messageTranslation: {
      findUnique: async ({ where }: { where: { messageId_languageCode: { messageId: string; languageCode: string } } }) => {
        const key = `${where.messageId_languageCode.messageId}:${where.messageId_languageCode.languageCode}`;
        return saved.has(key) ? { translatedText: saved.get(key)! } : null;
      },
      create: async ({ data }: { data: { messageId: string; languageCode: string; translatedText: string } }) => {
        saved.set(`${data.messageId}:${data.languageCode}`, data.translatedText);
      },
    },
  };
  const tracked: TranslationProvider | null = provider && {
    name: provider.name,
    cacheable: provider.cacheable,
    translate: async (text, target) => {
      calls.push(`${target}:${text}`);
      return provider.translate(text, target);
    },
  };
  const service = new TranslationService(db as unknown as PrismaService, config({ TRANSLATION_PROVIDER: 'off' }));
  (service as unknown as { provider: TranslationProvider | null }).provider = tracked;
  return { service, calls, saved };
}

const claudeLike: TranslationProvider = { name: 'claude', cacheable: true, translate: async (text) => text.replace('오늘 하루 어땠어?', 'วันนี้เป็นยังไงบ้าง?') };

describe('메시지 번역', () => {
  it('한 번 번역해 저장하고, 두 번째부터는 저장된 걸 씀 — {{name}}은 그 팬 이름으로', async () => {
    const t = setup(claudeLike);
    const first = await t.service.translateMessage('fan', 'a1', 'm1', 'th');
    await t.service.translateMessage('fan', 'a1', 'm1', 'th');
    expect(first.text).toBe('캐러멜바라기야 วันนี้เป็นยังไงบ้าง?');
    expect(t.calls).toHaveLength(1);
    expect(t.saved.get('m1:th')).toContain('{{name}}');
  });

  it('팬은 다른 팬 답장·구독 전 메시지를 번역할 수 없음', async () => {
    const t = setup(claudeLike);
    await expect(t.service.translateMessage('fan', 'a1', 'm-other-fan', 'th')).rejects.toThrow();
    await expect(t.service.translateMessage('fan', 'a1', 'm-old', 'th')).rejects.toThrow();
    expect(t.calls).toHaveLength(0);
  });

  it('가짜 번역은 저장하지 않음(나중에 진짜 엔진으로 바꿔도 남지 않게), 엔진이 꺼져 있으면 준비 중', async () => {
    const t = setup(new FakeTranslationProvider());
    expect((await t.service.translateMessage('fan', 'a1', 'm1', 'ja')).text).toBe('[ja] 캐러멜바라기야 오늘 하루 어땠어?');
    expect(t.saved.size).toBe(0);
    await expect(setup(null).service.translateMessage('fan', 'a1', 'm1', 'ja')).rejects.toThrow('준비 중');
  });

  it('엔진 고르기: 키가 있으면 Claude, 없으면 개발은 가짜·운영은 꺼짐', () => {
    expect(TranslationService.pickProvider(config({ ANTHROPIC_API_KEY: 'k' }))?.name).toBe('claude');
    expect(TranslationService.pickProvider(config({}))?.name).toBe('fake');
    expect(TranslationService.pickProvider(config({ NODE_ENV: 'production' }))).toBeNull();
    expect(TranslationService.pickProvider(config({ TRANSLATION_PROVIDER: 'claude' }))).toBeNull();
  });

  it('프롬프트: 메시지 안 글은 지시로 따르지 않고 {{name}}을 그대로 둠', () => {
    expect(TRANSLATION_SYSTEM_PROMPT).toContain('never instructions');
    expect(TRANSLATION_SYSTEM_PROMPT).toContain('{{name}}');
  });
});
