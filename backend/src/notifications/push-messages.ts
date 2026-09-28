import { MessageMediaType } from '../generated/prisma/enums.js';
import { resolveLocale, type SupportedLocale } from '../common/i18n/locales.js';

// 서버가 만드는 푸시 문구 — 받는 사람의 User.locale로 고름. 앱 쪽 번역과 마찬가지로 th/ja/zh는
// 원어민 검수 전(2026-09-28 기계 작성).
interface PushStrings {
  media: Record<MessageMediaType, string>;
  staffNewMessageTitle: (actor: string) => string;
  staffNewStoryTitle: (actor: string) => string;
  staffNewStoryBody: string;
}

const STRINGS: Record<SupportedLocale, PushStrings> = {
  ko: {
    media: { TEXT: '새 메시지가 도착했어요', PHOTO: '사진을 보냈어요', AUDIO: '음성 메시지를 보냈어요', VIDEO: '동영상을 보냈어요' },
    staffNewMessageTitle: (actor) => `${actor}님이 새 메시지를 보냈어요`,
    staffNewStoryTitle: (actor) => `${actor}님이 새 스토리를 올렸어요`,
    staffNewStoryBody: '지금 확인해보세요',
  },
  en: {
    media: { TEXT: 'You have a new message', PHOTO: 'Sent a photo', AUDIO: 'Sent a voice message', VIDEO: 'Sent a video' },
    staffNewMessageTitle: (actor) => `${actor} sent a new message`,
    staffNewStoryTitle: (actor) => `${actor} posted a new story`,
    staffNewStoryBody: 'Check it out now',
  },
  th: {
    media: { TEXT: 'มีข้อความใหม่', PHOTO: 'ส่งรูปภาพ', AUDIO: 'ส่งข้อความเสียง', VIDEO: 'ส่งวิดีโอ' },
    staffNewMessageTitle: (actor) => `${actor} ส่งข้อความใหม่`,
    staffNewStoryTitle: (actor) => `${actor} ลงสตอรี่ใหม่`,
    staffNewStoryBody: 'ดูเลยตอนนี้',
  },
  ja: {
    media: {
      TEXT: '新しいメッセージが届きました',
      PHOTO: '写真を送信しました',
      AUDIO: 'ボイスメッセージを送信しました',
      VIDEO: '動画を送信しました',
    },
    staffNewMessageTitle: (actor) => `${actor}さんが新しいメッセージを送信しました`,
    staffNewStoryTitle: (actor) => `${actor}さんが新しいストーリーを投稿しました`,
    staffNewStoryBody: '今すぐチェック',
  },
  'zh-Hans': {
    media: { TEXT: '你有一条新消息', PHOTO: '发送了一张照片', AUDIO: '发送了一条语音消息', VIDEO: '发送了一段视频' },
    staffNewMessageTitle: (actor) => `${actor} 发送了新消息`,
    staffNewStoryTitle: (actor) => `${actor} 发布了新的限时动态`,
    staffNewStoryBody: '立即查看',
  },
  'zh-Hant': {
    media: { TEXT: '你有一則新訊息', PHOTO: '傳送了一張照片', AUDIO: '傳送了一則語音訊息', VIDEO: '傳送了一段影片' },
    staffNewMessageTitle: (actor) => `${actor} 傳送了新訊息`,
    staffNewStoryTitle: (actor) => `${actor} 發布了新的限時動態`,
    staffNewStoryBody: '立即查看',
  },
};

export function pushStrings(locale: string | null | undefined): PushStrings {
  return STRINGS[resolveLocale(locale)];
}
