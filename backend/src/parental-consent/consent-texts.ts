import { resolveLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../common/i18n/locales.js';

// 부모(법정대리인) 동의 메일·웹 페이지 문구 — 부모는 앱을 쓰지 않으므로 서버가 직접 언어를 골라 만듦.
// th/ja/zh는 원어민 검수 전(2026-09-28 기계 작성, vi는 2026-10-02), 동의 안내 문구는 👤 변호사 검토 대상.

interface ConsentTexts {
  emailSubject: string;
  intro: string;
  about: string;
  emailAction: string;
  emailButton: string;
  emailIgnore: string;
  pageTitle: string;
  points: string[];
  agreeButton: string;
  doneTitle: string;
  doneBody: string;
  invalidTitle: string;
  invalidBody: string;
}

export const CONSENT_TEXTS: Record<SupportedLocale, ConsentTexts> = {
  ko: {
    emailSubject: 'Toffee 자녀 계정 이용 동의 요청',
    intro: '자녀분이 Toffee 가입을 위해 법정대리인(보호자) 동의를 요청했어요.',
    about: 'Toffee는 좋아하는 아티스트가 보내는 메시지를 구독해서 받아보는 유료 서비스예요.',
    emailAction: '아래 버튼을 눌러 내용을 확인하고 동의해 주세요. 링크는 7일 동안 유효해요.',
    emailButton: '확인하고 동의하기',
    emailIgnore: '요청한 적이 없다면 이 메일을 무시해 주세요. 동의하지 않으면 자녀 계정은 구독할 수 없어요.',
    pageTitle: '자녀 계정 이용 동의',
    points: [
      '구독은 유료이며 App Store·Google Play에서 결제돼요. 구독료는 아티스트마다 달라요.',
      '자녀분은 아티스트의 메시지를 받고 글로 답장할 수 있어요. 답장은 아티스트와 소속사가 볼 수 있고, 아티스트가 인용하면 다른 구독자에게 닉네임과 함께 보일 수 있어요.',
      '동의는 앱의 고객센터(문의하기)로 요청하면 언제든 철회할 수 있어요.',
    ],
    agreeButton: '동의합니다',
    doneTitle: '동의가 완료됐어요',
    doneBody: '이제 자녀분이 앱을 계속 이용할 수 있어요. 이 창은 닫아도 돼요.',
    invalidTitle: '링크가 유효하지 않거나 만료됐어요',
    invalidBody: '자녀분의 앱에서 동의 요청 메일을 다시 보내 주세요.',
  },
  en: {
    emailSubject: 'Toffee: consent request for your child’s account',
    intro: 'Your child has asked for your consent as their parent or guardian to use Toffee.',
    about: 'Toffee is a paid service where fans subscribe to receive messages from artists they love.',
    emailAction: 'Please tap the button below to review and give your consent. The link is valid for 7 days.',
    emailButton: 'Review and consent',
    emailIgnore: 'If you didn’t expect this, you can ignore this email. Without your consent, your child’s account can’t subscribe.',
    pageTitle: 'Consent for your child’s account',
    points: [
      'Subscriptions are paid and billed through the App Store or Google Play. Prices differ by artist.',
      'Your child can receive messages from artists and reply in text. Replies are visible to the artist and their agency, and if the artist quotes a reply, other subscribers may see it with your child’s nickname.',
      'You can withdraw consent at any time by contacting support in the app.',
    ],
    agreeButton: 'I consent',
    doneTitle: 'Consent complete',
    doneBody: 'Your child can now continue using the app. You can close this window.',
    invalidTitle: 'This link is invalid or has expired',
    invalidBody: 'Please ask your child to send the consent request again from the app.',
  },
  th: {
    emailSubject: 'Toffee: คำขอความยินยอมสำหรับบัญชีของบุตรหลาน',
    intro: 'บุตรหลานของคุณขอความยินยอมจากผู้ปกครองเพื่อใช้งาน Toffee',
    about: 'Toffee เป็นบริการแบบเสียค่าใช้จ่ายที่แฟนๆ สมัครสมาชิกเพื่อรับข้อความจากศิลปินที่ชื่นชอบ',
    emailAction: 'กรุณากดปุ่มด้านล่างเพื่อตรวจสอบรายละเอียดและให้ความยินยอม ลิงก์นี้ใช้ได้ 7 วัน',
    emailButton: 'ตรวจสอบและให้ความยินยอม',
    emailIgnore: 'หากคุณไม่ได้คาดว่าจะได้รับอีเมลนี้ สามารถเพิกเฉยได้ หากไม่ให้ความยินยอม บัญชีของบุตรหลานจะสมัครสมาชิกไม่ได้',
    pageTitle: 'ความยินยอมสำหรับบัญชีของบุตรหลาน',
    points: [
      'การสมัครสมาชิกมีค่าใช้จ่ายและชำระผ่าน App Store หรือ Google Play ราคาแตกต่างกันตามศิลปิน',
      'บุตรหลานของคุณจะได้รับข้อความจากศิลปินและตอบกลับเป็นข้อความได้ ศิลปินและต้นสังกัดจะเห็นข้อความตอบกลับ และหากศิลปินอ้างอิงข้อความนั้น สมาชิกคนอื่นอาจเห็นพร้อมชื่อเล่นของบุตรหลาน',
      'คุณสามารถถอนความยินยอมได้ตลอดเวลาโดยติดต่อฝ่ายบริการลูกค้าในแอป',
    ],
    agreeButton: 'ยินยอม',
    doneTitle: 'ให้ความยินยอมเรียบร้อยแล้ว',
    doneBody: 'ตอนนี้บุตรหลานของคุณใช้งานแอปต่อได้แล้ว ปิดหน้าต่างนี้ได้เลย',
    invalidTitle: 'ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว',
    invalidBody: 'กรุณาให้บุตรหลานส่งคำขอความยินยอมอีกครั้งจากแอป',
  },
  ja: {
    emailSubject: 'Toffee お子さまのアカウント利用への同意のお願い',
    intro: 'お子さまが Toffee を利用するため、保護者（法定代理人）の同意を求めています。',
    about: 'Toffee は、好きなアーティストから届くメッセージを購読して受け取る有料サービスです。',
    emailAction: '下のボタンから内容をご確認のうえ、同意してください。リンクの有効期限は7日間です。',
    emailButton: '内容を確認して同意する',
    emailIgnore: 'お心当たりがない場合は、このメールを無視してください。同意がない場合、お子さまのアカウントは購読できません。',
    pageTitle: 'お子さまのアカウント利用への同意',
    points: [
      '購読は有料で、App Store・Google Play で決済されます。料金はアーティストごとに異なります。',
      'お子さまはアーティストのメッセージを受け取り、文章で返信できます。返信はアーティストと所属事務所が閲覧でき、アーティストが引用すると、ほかの購読者にもニックネームとともに表示されることがあります。',
      '同意は、アプリのサポート（お問い合わせ）からいつでも撤回できます。',
    ],
    agreeButton: '同意します',
    doneTitle: '同意が完了しました',
    doneBody: 'お子さまは引き続きアプリをご利用いただけます。このウィンドウは閉じて構いません。',
    invalidTitle: 'リンクが無効か、有効期限が切れています',
    invalidBody: 'お子さまのアプリから同意依頼メールをもう一度送信してください。',
  },
  'zh-Hans': {
    emailSubject: 'Toffee：孩子账号使用同意请求',
    intro: '您的孩子为使用 Toffee，请求您作为监护人给予同意。',
    about: 'Toffee 是一项付费服务，粉丝可以订阅并接收喜爱的艺人发来的消息。',
    emailAction: '请点击下方按钮查看内容并给予同意。链接 7 天内有效。',
    emailButton: '查看并同意',
    emailIgnore: '如果您没有预期收到此邮件，可以忽略。未经您同意，孩子的账号无法订阅。',
    pageTitle: '孩子账号使用同意',
    points: [
      '订阅为付费服务，通过 App Store 或 Google Play 支付，价格因艺人而异。',
      '孩子可以接收艺人的消息并以文字回复。艺人及其经纪公司可以看到回复；如果艺人引用了回复，其他订阅者也可能看到回复及孩子的昵称。',
      '您可以随时通过应用内的客服（联系我们）撤回同意。',
    ],
    agreeButton: '我同意',
    doneTitle: '已完成同意',
    doneBody: '您的孩子现在可以继续使用应用了。您可以关闭此窗口。',
    invalidTitle: '链接无效或已过期',
    invalidBody: '请让孩子在应用中重新发送同意请求邮件。',
  },
  'zh-Hant': {
    emailSubject: 'Toffee：孩子帳號使用同意請求',
    intro: '您的孩子為使用 Toffee，請求您以監護人身分給予同意。',
    about: 'Toffee 是一項付費服務，粉絲可以訂閱並接收喜愛的藝人傳來的訊息。',
    emailAction: '請點選下方按鈕查看內容並給予同意。連結 7 天內有效。',
    emailButton: '查看並同意',
    emailIgnore: '如果您沒有預期收到此郵件，可以忽略。未經您同意，孩子的帳號無法訂閱。',
    pageTitle: '孩子帳號使用同意',
    points: [
      '訂閱為付費服務，透過 App Store 或 Google Play 付款，價格依藝人而異。',
      '孩子可以接收藝人的訊息並以文字回覆。藝人及其經紀公司可以看到回覆；如果藝人引用了回覆，其他訂閱者也可能看到回覆及孩子的暱稱。',
      '您可以隨時透過應用程式內的客服（聯絡我們）撤回同意。',
    ],
    agreeButton: '我同意',
    doneTitle: '已完成同意',
    doneBody: '您的孩子現在可以繼續使用應用程式了。您可以關閉此視窗。',
    invalidTitle: '連結無效或已過期',
    invalidBody: '請讓孩子在應用程式中重新傳送同意請求郵件。',
  },
  vi: {
    emailSubject: 'Toffee: yêu cầu đồng ý cho tài khoản của con bạn',
    intro: 'Con bạn đã đề nghị bạn, với tư cách cha mẹ hoặc người giám hộ, đồng ý cho con sử dụng Toffee.',
    about: 'Toffee là dịch vụ trả phí, nơi fan đăng ký để nhận tin nhắn từ nghệ sĩ mình yêu thích.',
    emailAction: 'Vui lòng nhấn nút bên dưới để xem nội dung và đồng ý. Liên kết có hiệu lực trong 7 ngày.',
    emailButton: 'Xem và đồng ý',
    emailIgnore: 'Nếu bạn không mong đợi email này, bạn có thể bỏ qua. Nếu không có sự đồng ý của bạn, tài khoản của con bạn không thể đăng ký.',
    pageTitle: 'Đồng ý cho tài khoản của con bạn',
    points: [
      'Gói đăng ký là dịch vụ trả phí, thanh toán qua App Store hoặc Google Play. Giá khác nhau tùy nghệ sĩ.',
      'Con bạn có thể nhận tin nhắn từ nghệ sĩ và trả lời bằng văn bản. Nghệ sĩ và công ty quản lý của họ có thể xem câu trả lời; nếu nghệ sĩ trích dẫn câu trả lời, những người đăng ký khác cũng có thể thấy câu trả lời cùng biệt danh của con bạn.',
      'Bạn có thể rút lại sự đồng ý bất cứ lúc nào bằng cách liên hệ hỗ trợ trong ứng dụng.',
    ],
    agreeButton: 'Tôi đồng ý',
    doneTitle: 'Đã đồng ý',
    doneBody: 'Con bạn giờ có thể tiếp tục sử dụng ứng dụng. Bạn có thể đóng cửa sổ này.',
    invalidTitle: 'Liên kết không hợp lệ hoặc đã hết hạn',
    invalidBody: 'Vui lòng nhờ con bạn gửi lại yêu cầu đồng ý từ ứng dụng.',
  },
};

// 언어 선택 줄에 보여줄 이름(항상 그 언어 자신의 표기)
const NATIVE_NAMES: Record<SupportedLocale, string> = {
  ko: '한국어',
  th: 'ไทย',
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  vi: 'Tiếng Việt',
};

// 자녀 계정에 앱 언어가 없을 때 국가로 추정
const LOCALE_BY_COUNTRY: Record<string, SupportedLocale> = {
  KR: 'ko',
  TH: 'th',
  JP: 'ja',
  CN: 'zh-Hans',
  SG: 'zh-Hans',
  MY: 'zh-Hans',
  TW: 'zh-Hant',
  HK: 'zh-Hant',
  MO: 'zh-Hant',
  VN: 'vi',
};

/** 자녀 계정 기준 언어 — 앱 언어 → 가입 국가 → 영어 */
export function childLocale(user: { locale: string | null; countryCode: string | null }): SupportedLocale {
  if (user.locale && (SUPPORTED_LOCALES as readonly string[]).includes(user.locale)) return user.locale as SupportedLocale;
  return (user.countryCode && LOCALE_BY_COUNTRY[user.countryCode.toUpperCase()]) || 'en';
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 동의 요청 메일 — 자녀 언어로 쓰고, 영어가 아니면 아래에 영어를 한 번 더(부모가 다른 언어를 쓸 수 있어서) */
export function consentEmail(locale: SupportedLocale, confirmUrl: string): { subject: string; html: string } {
  const section = (l: SupportedLocale) => {
    const t = CONSENT_TEXTS[l];
    return `<div lang="${l}" style="margin-bottom:28px">
  <p style="font-size:16px;font-weight:600;margin:0 0 12px">${escapeHtml(t.intro)}</p>
  <p style="margin:0 0 12px">${escapeHtml(t.about)}</p>
  <p style="margin:0 0 16px">${escapeHtml(t.emailAction)}</p>
  <p style="margin:0 0 16px"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#7C8CFF;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${escapeHtml(t.emailButton)}</a></p>
  <p style="margin:0;color:#6B6F7A;font-size:13px">${escapeHtml(t.emailIgnore)}</p>
</div>`;
  };
  const locales: SupportedLocale[] = locale === 'en' ? ['en'] : [locale, 'en'];
  const html = `<div style="font-family:-apple-system,'Segoe UI',sans-serif;color:#0F1115;line-height:1.6;max-width:520px">
${locales.map(section).join('\n<hr style="border:none;border-top:1px solid #F4F6FB;margin:0 0 28px">\n')}
<p style="margin:0;color:#6B6F7A;font-size:12px;word-break:break-all">${escapeHtml(confirmUrl)}</p>
</div>`;
  return { subject: CONSENT_TEXTS[locale].emailSubject, html };
}

export type ConsentPageState = 'ask' | 'done' | 'invalid';

/** 부모가 여는 웹 페이지 — 안내 + "동의합니다" 버튼(POST), 완료, 유효하지 않음 세 가지 */
export function consentPage(state: ConsentPageState, locale: SupportedLocale, token?: string): string {
  const t = CONSENT_TEXTS[resolveLocale(locale)];
  const langLinks = SUPPORTED_LOCALES.map((l) =>
    l === locale
      ? `<strong>${NATIVE_NAMES[l]}</strong>`
      : `<a href="?${token ? `token=${encodeURIComponent(token)}&amp;` : ''}lang=${l}">${NATIVE_NAMES[l]}</a>`,
  ).join(' · ');
  const body =
    state === 'ask'
      ? `<h1>${escapeHtml(t.pageTitle)}</h1>
<p>${escapeHtml(t.intro)}</p>
<p>${escapeHtml(t.about)}</p>
<ul>${t.points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
<form method="post" action="confirm">
  <input type="hidden" name="token" value="${escapeHtml(token ?? '')}">
  <input type="hidden" name="lang" value="${locale}">
  <button type="submit">${escapeHtml(t.agreeButton)}</button>
</form>`
      : state === 'done'
        ? `<h1>${escapeHtml(t.doneTitle)}</h1><p>${escapeHtml(t.doneBody)}</p>`
        : `<h1>${escapeHtml(t.invalidTitle)}</h1><p>${escapeHtml(t.invalidBody)}</p>`;
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Toffee — ${escapeHtml(t.pageTitle)}</title>
<style>
  :root { color-scheme: light dark; --text:#0F1115; --sub:#6B6F7A; --bg:#ffffff; --card:#F4F6FB; --tint:#7C8CFF; }
  @media (prefers-color-scheme: dark) { :root { --text:#ffffff; --sub:#A0A3AD; --bg:#0F1115; --card:#1A1C22; } }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,'Segoe UI','Noto Sans Thai','Noto Sans KR',sans-serif; line-height:1.6; }
  main { max-width:520px; margin:0 auto; padding:32px 16px 48px; }
  .brand { color:var(--tint); font-weight:700; letter-spacing:.02em; }
  .langs { font-size:13px; color:var(--sub); margin:8px 0 24px; }
  .langs a { color:var(--sub); }
  h1 { font-size:22px; margin:0 0 16px; }
  ul { background:var(--card); border-radius:14px; padding:16px 16px 16px 32px; }
  li + li { margin-top:8px; }
  button { width:100%; border:0; border-radius:14px; background:var(--tint); color:#fff; font-size:17px; font-weight:600; padding:14px; cursor:pointer; }
</style>
</head>
<body><main>
<div class="brand">Toffee</div>
<div class="langs">${langLinks}</div>
${body}
</main></body>
</html>`;
}
