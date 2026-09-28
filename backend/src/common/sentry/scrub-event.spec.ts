import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nestjs';
import { scrubEvent } from './scrub-event.js';

describe('scrubEvent', () => {
  it('민감 헤더·바디 필드·쿼리스트링·쿠키를 가리고 user는 id만 남긴다', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        headers: { Authorization: 'Bearer secret', 'content-type': 'application/json' },
        cookies: { session: 'abc' },
        data: { idToken: 'tok', profile: { parentEmail: 'mom@example.com', nickname: '민지' }, items: [{ email: 'a@b.c' }] },
        query_string: 'token=xyz',
      },
      user: { id: 'user-1', email: 'fan@example.com', ip_address: '1.2.3.4' },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.headers).toEqual({ Authorization: '[redacted]', 'content-type': 'application/json' });
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toEqual({
      idToken: '[redacted]',
      profile: { parentEmail: '[redacted]', nickname: '민지' },
      items: [{ email: '[redacted]' }],
    });
    expect(scrubbed.request?.query_string).toBe('[redacted]');
    expect(scrubbed.user).toEqual({ id: 'user-1' });
  });

  it('문자열 JSON 바디도 파싱해서 가리고, JSON이 아니면 통째로 가린다', () => {
    const json = scrubEvent({ type: undefined, request: { data: JSON.stringify({ email: 'a@b.c', body: 'hi' }) } });
    expect(JSON.parse(json.request?.data as string)).toEqual({ email: '[redacted]', body: 'hi' });

    const raw = scrubEvent({ type: undefined, request: { data: 'email=a@b.c' } });
    expect(raw.request?.data).toBe('[redacted]');
  });
});
