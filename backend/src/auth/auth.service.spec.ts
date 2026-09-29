import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { AuthProvider } from '../generated/prisma/enums.js';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ModerationService } from '../moderation/moderation.service.js';

function setup() {
  const prisma = {
    authIdentity: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'victim', role: 'USER' }),
      create: vi.fn().mockResolvedValue({ id: 'new', role: 'USER' }),
    },
  };
  const service = new AuthService({ get: () => undefined } as unknown as ConfigService, {} as JwtService, prisma as unknown as PrismaService, {} as ModerationService);
  return { service, prisma };
}

describe('소셜 로그인 계정 합치기', () => {
  it('확인된 이메일이면 같은 이메일 계정에 합침', async () => {
    const { service } = setup();
    await expect(
      service.findOrCreateUser(AuthProvider.GOOGLE, { providerId: 'g1', email: 'a@x.com', emailVerified: true }),
    ).resolves.toEqual({ id: 'victim', role: 'USER' });
  });

  it('확인 안 된 이메일이면 합치지도 저장하지도 않고 새 계정(남의 계정 탈취 방지)', async () => {
    const { service, prisma } = setup();
    await expect(
      service.findOrCreateUser(AuthProvider.KAKAO, { providerId: 'k1', email: 'a@x.com', emailVerified: false }),
    ).resolves.toEqual({ id: 'new', role: 'USER' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create.mock.calls[0][0].data.email).toBeUndefined();
  });
});

describe('소셜 토큰 확인 보강(2026-09-29)', () => {
  const withConfig = (values: Record<string, string>) =>
    new AuthService({ get: (key: string) => values[key] } as unknown as ConfigService, {} as JwtService, {} as PrismaService, {} as ModerationService);

  it('카카오: 다른 앱에서 발급된 토큰이면 거절(KAKAO_APP_ID)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('access_token_info')
        ? new Response(JSON.stringify({ app_id: 999 }))
        : new Response(JSON.stringify({ id: 1, kakao_account: {} })),
    );
    await expect(withConfig({ KAKAO_APP_ID: '123,456' }).verifyKakaoToken('t')).rejects.toThrow();
    await expect(withConfig({ KAKAO_APP_ID: '123,999' }).verifyKakaoToken('t')).resolves.toMatchObject({ providerId: '1' });
    fetchMock.mockRestore();
  });

  it('LINE: 채널이 여러 개면 idToken의 aud와 맞는 채널로 확인', async () => {
    const bodies: string[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ sub: 'line-user' }));
    });
    const idToken = ['x', Buffer.from(JSON.stringify({ aud: '2002' })).toString('base64url'), 'y'].join('.');
    await expect(withConfig({ LINE_CHANNEL_ID: '2001, 2002' }).verifyLineToken(idToken)).resolves.toMatchObject({ providerId: 'line-user' });
    expect(bodies[0]).toContain('client_id=2002');
    fetchMock.mockRestore();
  });

  it('설정이 없으면 로그인 거절(조용히 통과시키지 않음)', async () => {
    await expect(withConfig({}).verifyAppleToken('t')).rejects.toThrow();
  });
});

describe('PC 웹 소셜 로그인(code 교환)', () => {
  const withConfig = (values: Record<string, string>) =>
    new AuthService({ get: (key: string) => values[key] } as unknown as ConfigService, {} as JwtService, {} as PrismaService, {} as ModerationService);

  it('허용한 웹 주소로 돌아온 code만 받음(설정이 없으면 웹 로그인 꺼짐)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(withConfig({ KAKAO_REST_API_KEY: 'k' }).verifyKakaoWebCode('c', 'https://admin.toffee.app/oauth/kakao')).rejects.toThrow();
    await expect(
      withConfig({ KAKAO_REST_API_KEY: 'k', WEB_LOGIN_ORIGINS: 'https://admin.toffee.app' }).verifyKakaoWebCode('c', 'https://evil.example/oauth/kakao'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('카카오: code → 토큰 → 앱과 같은 확인(앱 ID 포함)', async () => {
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push(`${String(url)} ${String(init?.body ?? '')}`);
      if (String(url).includes('oauth/token')) return new Response(JSON.stringify({ access_token: 'at' }));
      if (String(url).includes('access_token_info')) return new Response(JSON.stringify({ app_id: 7 }));
      return new Response(JSON.stringify({ id: 42, kakao_account: {} }));
    });
    const service = withConfig({ KAKAO_REST_API_KEY: 'rest', KAKAO_APP_ID: '7', WEB_LOGIN_ORIGINS: 'https://admin.toffee.app, http://localhost:8081' });
    await expect(service.verifyKakaoWebCode('code-1', 'http://localhost:8081/oauth/kakao')).resolves.toMatchObject({ providerId: '42' });
    expect(calls[0]).toContain('client_id=rest');
    expect(calls[0]).toContain('code=code-1');
    fetchMock.mockRestore();
  });

  it('LINE: code → id_token → verify(웹 채널)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('oauth2/v2.1/token')
        ? new Response(JSON.stringify({ id_token: ['x', Buffer.from(JSON.stringify({ aud: '3003' })).toString('base64url'), 'y'].join('.') }))
        : new Response(JSON.stringify({ sub: 'line-web-user' })),
    );
    const service = withConfig({ LINE_WEB_CHANNEL_ID: '3003', LINE_WEB_CHANNEL_SECRET: 's', LINE_CHANNEL_ID: '2001,3003', WEB_LOGIN_ORIGINS: 'https://admin.toffee.app' });
    await expect(service.verifyLineWebCode('c', 'https://admin.toffee.app/oauth/line')).resolves.toMatchObject({ providerId: 'line-web-user' });
    fetchMock.mockRestore();
  });
});
