import { MessageMediaType } from '../generated/prisma/enums.js';
import { resolveLocale, type SupportedLocale } from '../common/i18n/locales.js';

// 서버가 만드는 푸시 문구 — 받는 사람의 User.locale로 고름. 앱 쪽 번역과 마찬가지로 th/ja/zh는
// 원어민 검수 전(2026-09-28 기계 작성).
interface PushStrings {
  media: Record<MessageMediaType, string>;
  staffNewMessageTitle: (actor: string) => string;
  /** 스타가 내 메시지를 인용해 답장했을 때(인용된 팬에게만) */
  quotedReplyTitle: (actor: string) => string;
  staffNewStoryTitle: (actor: string) => string;
  staffNewStoryBody: string;
  /** 장기 미발송 알림(배우 본인) — 팬 수, 며칠째, 커플방이면 방 이름 */
  idleActorTitle: (fans: number) => string;
  idleActorBody: (days: number, room?: string) => string;
  /** 장기 미발송 알림(소속사, 7일부터) */
  idleStaffTitle: (actor: string, days: number) => string;
  idleStaffBody: (fans: number) => string;
  // 환불 기준(30일 미발송) 경고 — 배우·소속사·운영자 공통
  idleRefundTitle: (room: string, daysLeft: number) => string;
  idleRefundBody: (days: number, fans: number) => string;
}

const STRINGS: Record<SupportedLocale, PushStrings> = {
  ko: {
    media: { TEXT: '새 메시지가 도착했어요', PHOTO: '사진을 보냈어요', AUDIO: '음성 메시지를 보냈어요', VIDEO: '동영상을 보냈어요' },
    staffNewMessageTitle: (actor) => `${actor}님이 새 메시지를 보냈어요`,
    quotedReplyTitle: (actor) => `${actor}님이 내 메시지에 답장했어요`,
    staffNewStoryTitle: (actor) => `${actor}님이 새 스토리를 올렸어요`,
    staffNewStoryBody: '지금 확인해보세요',
    idleActorTitle: (fans) => `팬 ${fans}명이 기다리고 있어요`,
    idleActorBody: (days, room) => `${room ? `${room} · ` : ''}마지막 메시지가 ${days}일 전이에요. 짧은 인사라도 남겨 볼까요?`,
    idleStaffTitle: (actor, days) => `${actor}님이 ${days}일째 메시지를 보내지 않았어요`,
    idleStaffBody: (fans) => `구독 중인 팬 ${fans}명`,
    idleRefundTitle: (room, left) => `${room} · ${left === 1 ? '내일' : `${left}일 뒤`}부터 팬이 환불을 요청할 수 있어요`,
    idleRefundBody: (days, fans) => `${days}일째 메시지가 없어요. 30일 동안 메시지가 없으면 팬 ${fans}명이 그 달 구독료 환불을 요청할 수 있어요. 지금 한 마디 남겨 주세요.`,
  },
  en: {
    media: { TEXT: 'You have a new message', PHOTO: 'Sent a photo', AUDIO: 'Sent a voice message', VIDEO: 'Sent a video' },
    staffNewMessageTitle: (actor) => `${actor} sent a new message`,
    quotedReplyTitle: (actor) => `${actor} replied to your message`,
    staffNewStoryTitle: (actor) => `${actor} posted a new story`,
    staffNewStoryBody: 'Check it out now',
    idleActorTitle: (fans) => `${fans} fans are waiting for you`,
    idleActorBody: (days, room) => `${room ? `${room} · ` : ''}Your last message was ${days} days ago. How about a quick hello?`,
    idleStaffTitle: (actor, days) => `${actor} hasn't sent a message in ${days} days`,
    idleStaffBody: (fans) => `${fans} active subscribers`,
    idleRefundTitle: (room, left) => `${room} · fans can request refunds ${left === 1 ? 'from tomorrow' : `in ${left} days`}`,
    idleRefundBody: (days, fans) => `No messages for ${days} days. After 30 days without a message, ${fans} fans can request a refund for that month. Please send a message now.`,
  },
  th: {
    media: { TEXT: 'มีข้อความใหม่', PHOTO: 'ส่งรูปภาพ', AUDIO: 'ส่งข้อความเสียง', VIDEO: 'ส่งวิดีโอ' },
    staffNewMessageTitle: (actor) => `${actor} ส่งข้อความใหม่`,
    quotedReplyTitle: (actor) => `${actor} ตอบกลับข้อความของคุณ`,
    staffNewStoryTitle: (actor) => `${actor} ลงสตอรี่ใหม่`,
    staffNewStoryBody: 'ดูเลยตอนนี้',
    idleActorTitle: (fans) => `แฟน ${fans} คนกำลังรออยู่`,
    idleActorBody: (days, room) => `${room ? `${room} · ` : ''}ข้อความล่าสุดเมื่อ ${days} วันก่อน ลองทักทายสั้น ๆ ดูไหม?`,
    idleStaffTitle: (actor, days) => `${actor} ไม่ได้ส่งข้อความมา ${days} วันแล้ว`,
    idleStaffBody: (fans) => `ผู้สมัครสมาชิก ${fans} คน`,
    idleRefundTitle: (room, left) => `${room} · แฟนจะขอคืนเงินได้${left === 1 ? 'ตั้งแต่พรุ่งนี้' : `ในอีก ${left} วัน`}`,
    idleRefundBody: (days, fans) => `ไม่มีข้อความมา ${days} วันแล้ว หากไม่มีข้อความครบ 30 วัน แฟน ${fans} คนจะขอคืนเงินค่าสมาชิกของเดือนนั้นได้ ส่งข้อความสักประโยคตอนนี้เลย`,
  },
  ja: {
    media: {
      TEXT: '新しいメッセージが届きました',
      PHOTO: '写真を送信しました',
      AUDIO: 'ボイスメッセージを送信しました',
      VIDEO: '動画を送信しました',
    },
    staffNewMessageTitle: (actor) => `${actor}さんが新しいメッセージを送信しました`,
    quotedReplyTitle: (actor) => `${actor}さんがあなたのメッセージに返信しました`,
    staffNewStoryTitle: (actor) => `${actor}さんが新しいストーリーを投稿しました`,
    staffNewStoryBody: '今すぐチェック',
    idleActorTitle: (fans) => `ファン${fans}人が待っています`,
    idleActorBody: (days, room) => `${room ? `${room} · ` : ''}最後のメッセージは${days}日前です。ひとことだけでも送ってみませんか？`,
    idleStaffTitle: (actor, days) => `${actor}さんが${days}日間メッセージを送っていません`,
    idleStaffBody: (fans) => `購読中のファン${fans}人`,
    idleRefundTitle: (room, left) => `${room}・${left === 1 ? '明日' : `${left}日後`}からファンが返金を申請できます`,
    idleRefundBody: (days, fans) => `${days}日間メッセージがありません。30日間メッセージがないと、ファン${fans}人がその月の購読料の返金を申請できます。今ひとこと送ってください。`,
  },
  'zh-Hans': {
    media: { TEXT: '你有一条新消息', PHOTO: '发送了一张照片', AUDIO: '发送了一条语音消息', VIDEO: '发送了一段视频' },
    staffNewMessageTitle: (actor) => `${actor} 发送了新消息`,
    quotedReplyTitle: (actor) => `${actor} 回复了你的消息`,
    staffNewStoryTitle: (actor) => `${actor} 发布了新的限时动态`,
    staffNewStoryBody: '立即查看',
    idleActorTitle: (fans) => `${fans} 位粉丝在等你`,
    idleActorBody: (days, room) => `${room ? `${room} · ` : ''}上一条消息是 ${days} 天前。发一句简短的问候吧？`,
    idleStaffTitle: (actor, days) => `${actor} 已 ${days} 天没有发送消息`,
    idleStaffBody: (fans) => `订阅中的粉丝 ${fans} 人`,
    idleRefundTitle: (room, left) => `${room} · ${left === 1 ? '明天起' : `${left} 天后`}粉丝可申请退款`,
    idleRefundBody: (days, fans) => `已 ${days} 天没有消息。30 天没有消息的话，${fans} 位粉丝可以申请当月订阅费退款。现在就发一句吧。`,
  },
  'zh-Hant': {
    media: { TEXT: '你有一則新訊息', PHOTO: '傳送了一張照片', AUDIO: '傳送了一則語音訊息', VIDEO: '傳送了一段影片' },
    staffNewMessageTitle: (actor) => `${actor} 傳送了新訊息`,
    quotedReplyTitle: (actor) => `${actor} 回覆了你的訊息`,
    staffNewStoryTitle: (actor) => `${actor} 發布了新的限時動態`,
    staffNewStoryBody: '立即查看',
    idleActorTitle: (fans) => `${fans} 位粉絲在等你`,
    idleActorBody: (days, room) => `${room ? `${room} · ` : ''}上一則訊息是 ${days} 天前。傳一句簡短的問候吧？`,
    idleStaffTitle: (actor, days) => `${actor} 已 ${days} 天沒有傳送訊息`,
    idleStaffBody: (fans) => `訂閱中的粉絲 ${fans} 人`,
    idleRefundTitle: (room, left) => `${room} · ${left === 1 ? '明天起' : `${left} 天後`}粉絲可申請退款`,
    idleRefundBody: (days, fans) => `已 ${days} 天沒有訊息。30 天沒有訊息的話，${fans} 位粉絲可以申請當月訂閱費退款。現在就傳一句吧。`,
  },
};

export function pushStrings(locale: string | null | undefined): PushStrings {
  return STRINGS[resolveLocale(locale)];
}
