import { describe, expect, it } from 'vitest';
import { canReceive } from './realtime.controller.js';

const fan = { admin: false, subscribed: new Set(['a1']), staff: new Set<string>() };
const star = { admin: false, subscribed: new Set<string>(), staff: new Set(['a1']) };

describe('실시간 신호 받을 대상', () => {
  it('팬은 구독 중인 아티스트의 아티스트 메시지·삭제 신호만', () => {
    expect(canReceive(fan, { kind: 'artist-message', actorId: 'a1' })).toBe(true);
    expect(canReceive(fan, { kind: 'message-removed', actorId: 'a1' })).toBe(true);
    expect(canReceive(fan, { kind: 'artist-message', actorId: 'a2' })).toBe(false);
  });

  it('다른 팬의 답장 신호는 팬에게 안 감', () => {
    expect(canReceive(fan, { kind: 'fan-reply', actorId: 'a1', messageId: 'm1' })).toBe(false);
  });

  it('아티스트·소속사는 자기 아티스트의 모든 신호, 운영자는 전부', () => {
    expect(canReceive(star, { kind: 'fan-reply', actorId: 'a1', messageId: 'm1' })).toBe(true);
    expect(canReceive(star, { kind: 'fan-reply', actorId: 'a2', messageId: 'm1' })).toBe(false);
    expect(canReceive({ admin: true, subscribed: new Set(), staff: new Set() }, { kind: 'fan-reply', actorId: 'a9' })).toBe(true);
  });
});
