import { SUPPORTED_LOCALES, type SupportedLocale } from '../common/i18n/locales.js';
import { escapeHtml } from '../parental-consent/consent-texts.js';
import { DRAFT_NOTICE, LEGAL_SECTIONS, LEGAL_TITLES, LEGAL_VERSION, type LegalDoc } from './legal-texts.js';

const NATIVE_NAMES: Record<SupportedLocale, string> = {
  ko: '한국어',
  th: 'ไทย',
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
};

export const SUPPORT_TITLES: Record<SupportedLocale, { title: string; body: string; noEmail: string }> = {
  ko: { title: '고객센터', body: '문의는 아래 이메일로 보내 주세요. 앱의 프로필 → 문의하기를 쓰면 회원 번호가 자동으로 붙어 더 빨리 도와드릴 수 있어요.', noEmail: '문의 창구를 준비 중이에요.' },
  en: { title: 'Support', body: 'Please email us at the address below. Using Profile → Contact us in the app attaches your member ID so we can help faster.', noEmail: 'Our support channel is being set up.' },
  th: { title: 'ฝ่ายบริการลูกค้า', body: 'ส่งอีเมลถึงเราได้ที่ที่อยู่ด้านล่าง หากใช้ โปรไฟล์ → ติดต่อเรา ในแอป จะแนบหมายเลขสมาชิกให้อัตโนมัติ ช่วยให้เราช่วยได้เร็วขึ้น', noEmail: 'กำลังเตรียมช่องทางติดต่อ' },
  ja: { title: 'サポート', body: 'お問い合わせは下記のメールアドレスまでお送りください。アプリのプロフィール → お問い合わせを使うと会員番号が自動で添付され、より早く対応できます。', noEmail: 'お問い合わせ窓口を準備中です。' },
  'zh-Hans': { title: '客服中心', body: '请发送邮件至以下地址。使用应用中的“个人资料 → 联系我们”会自动附上会员编号，便于我们更快处理。', noEmail: '客服渠道正在准备中。' },
  'zh-Hant': { title: '客服中心', body: '請寄信至以下地址。使用 App 中的「個人資料 → 聯絡我們」會自動附上會員編號，方便我們更快處理。', noEmail: '客服管道正在準備中。' },
};

function shell(locale: SupportedLocale, title: string, body: string): string {
  const langLinks = SUPPORTED_LOCALES.map((l) => (l === locale ? `<strong>${NATIVE_NAMES[l]}</strong>` : `<a href="?lang=${l}">${NATIVE_NAMES[l]}</a>`)).join(' · ');
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Toffee — ${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --text:#0F1115; --sub:#6B6F7A; --bg:#ffffff; --card:#F4F6FB; --tint:#7C8CFF; }
  @media (prefers-color-scheme: dark) { :root { --text:#ffffff; --sub:#A0A3AD; --bg:#0F1115; --card:#1A1C22; } }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,'Segoe UI','Pretendard','Noto Sans Thai','Noto Sans KR',sans-serif; line-height:1.7; }
  main { max-width:680px; margin:0 auto; padding:32px 16px 56px; }
  .brand { color:var(--tint); font-weight:700; letter-spacing:.02em; }
  .langs { font-size:13px; color:var(--sub); margin:8px 0 24px; }
  .langs a { color:var(--sub); }
  h1 { font-size:24px; margin:0 0 16px; }
  h2 { font-size:16px; margin:28px 0 6px; }
  p { margin:0; color:var(--sub); }
  .notice { background:var(--card); border-radius:14px; padding:14px 16px; margin-bottom:8px; }
  .notice strong { color:var(--text); }
  .meta { font-size:12px; color:var(--sub); margin-top:32px; }
  a.mail { color:var(--tint); font-weight:600; font-size:18px; }
</style>
</head>
<body><main>
<div class="brand">Toffee</div>
<div class="langs">${langLinks}</div>
${body}
</main></body>
</html>`;
}

/** 공개 약관·개인정보처리방침 페이지 — 초안 안내는 선택 언어, 본문은 한국어(최종본 나오면 번역) */
export function legalPage(doc: LegalDoc, locale: SupportedLocale): string {
  const notice = DRAFT_NOTICE[locale];
  const sections = LEGAL_SECTIONS[doc].map((s) => `<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.body)}</p>`).join('\n');
  return shell(
    locale,
    LEGAL_TITLES[doc][locale],
    `<h1>${escapeHtml(LEGAL_TITLES[doc][locale])}</h1>
<div class="notice"><strong>${escapeHtml(notice.title)}</strong><br>${escapeHtml(notice.body)}</div>
${sections}
<div class="meta">${escapeHtml(LEGAL_VERSION)}</div>`,
  );
}

/** 스토어 "지원 URL"용 고객센터 페이지 */
export function supportPage(locale: SupportedLocale, email: string | null): string {
  const t = SUPPORT_TITLES[locale];
  return shell(
    locale,
    t.title,
    `<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.body)}</p>
<p style="margin-top:20px">${email ? `<a class="mail" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : escapeHtml(t.noEmail)}</p>`,
  );
}
