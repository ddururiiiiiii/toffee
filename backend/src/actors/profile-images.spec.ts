import { withFirstOfficialAsChat } from './profile-images.js';

const empty = { officialProfileImageUrl: null, chatProfileImageUrl: null };

describe('withFirstOfficialAsChat', () => {
  it('처음 올린 공식 사진은 비어 있는 대화방 사진에도 씀', () => {
    expect(withFirstOfficialAsChat(empty, { official: 'a.jpg' })).toEqual({ official: 'a.jpg', chat: 'a.jpg' });
  });

  it('대화방 사진이 이미 있으면 그대로', () => {
    expect(withFirstOfficialAsChat({ ...empty, chatProfileImageUrl: 'mine.jpg' }, { official: 'a.jpg' })).toEqual({ official: 'a.jpg' });
  });

  it('공식 사진을 바꿀 때는(이전 공식 사진 있음) 대화방 사진을 안 채움 — 아티스트가 지운 기본 프로필 유지', () => {
    expect(withFirstOfficialAsChat({ ...empty, officialProfileImageUrl: 'old.jpg' }, { official: 'new.jpg' })).toEqual({ official: 'new.jpg' });
  });

  it('대화방 사진도 같이 지정했거나 공식 사진을 지우는 경우는 그대로', () => {
    expect(withFirstOfficialAsChat(empty, { official: 'a.jpg', chat: 'b.jpg' })).toEqual({ official: 'a.jpg', chat: 'b.jpg' });
    expect(withFirstOfficialAsChat(empty, { official: null })).toEqual({ official: null });
    expect(withFirstOfficialAsChat(empty, { chat: null })).toEqual({ chat: null });
  });
});
