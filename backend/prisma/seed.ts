// 데모/개발용 시드 데이터 — 전부 가상의 배우/팬이며 실제 배우 정보는 계약 전까지 절대 넣지 않음.
// 실행: npx prisma db seed
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { MessageSenderType, MessageMediaType, Role } from '../src/generated/prisma/enums.js';
import { CURRENT_TERMS_VERSION } from '../src/common/legal/terms.js';

// 데모 계정은 약관 동의를 마친 상태로(새로 가입하는 계정은 앱 온보딩에서 동의)
const AGREED = { termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function main() {
  // 기존 시드 데이터 정리 (FK 순서대로)
  await prisma.report.deleteMany();
  await prisma.messageTranslation.deleteMany();
  await prisma.message.deleteMany();
  await prisma.storyView.deleteMany();
  await prisma.story.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.bundle.deleteMany();
  await prisma.authIdentity.deleteMany();
  await prisma.glCp.deleteMany();
  await prisma.actorAgencyHistory.deleteMany();
  await prisma.actor.deleteMany();
  await prisma.user.deleteMany();
  await prisma.agency.deleteMany();
  await prisma.bannedWord.deleteMany();

  // 가상의 소속사 2곳 — 현 소속사 + 이적 이력 데모용 이전 소속사
  const demoAgency = await prisma.agency.create({
    data: { name: '(가상) 데모 엔터테인먼트', logoUrl: 'https://placehold.co/200x200?text=Demo+Ent' },
  });
  const formerAgency = await prisma.agency.create({
    data: { name: '(가상) 이전 소속사', logoUrl: 'https://placehold.co/200x200?text=Former' },
  });

  // 가상의 배우 2명 — 이름/사진 전부 가상, Toffee 캔디 테마로 지음
  const caramel = await prisma.actor.create({
    data: {
      legalName: '(가상) 데모 배우 A',
      officialProfileImageUrl: 'https://placehold.co/600x800?text=Caramel',
      chatDisplayName: '캐러멜',
      chatProfileImageUrl: 'https://placehold.co/400x400?text=%EC%BA%90%EB%9F%AC%EB%A9%9C',
      monthlyPriceCents: 9900, // 데모 가격 — 실제 태국 시장 가격은 별도 검증 필요
      agencyId: demoAgency.id,
    },
  });

  const nougat = await prisma.actor.create({
    data: {
      legalName: '(가상) 데모 배우 B',
      officialProfileImageUrl: 'https://placehold.co/600x800?text=Nougat',
      chatDisplayName: '누가',
      chatProfileImageUrl: 'https://placehold.co/400x400?text=%EB%88%84%EA%B0%80',
      monthlyPriceCents: 9900,
      agencyId: demoAgency.id,
    },
  });

  // 소속사 이력 — 캐러멜은 처음부터 데모 엔터, 누가는 30일 전 이전 소속사에서 이적
  // (이적 전 기록은 이전 소속사가 볼 수 없어야 하고, 정산 이력으로만 남는지 확인용)
  await prisma.actorAgencyHistory.createMany({
    data: [
      { actorId: caramel.id, agencyId: demoAgency.id, startedAt: daysAgo(120) },
      { actorId: nougat.id, agencyId: formerAgency.id, startedAt: daysAgo(120), endedAt: daysAgo(30) },
      { actorId: nougat.id, agencyId: demoAgency.id, startedAt: daysAgo(30) },
    ],
  });

  // 팬에게 노출 안 되는 내부 CP 페어링 — 둘 다 구독하면 15% 할인
  await prisma.glCp.create({
    data: { actorOneId: caramel.id, actorTwoId: nougat.id, discountPercent: 15 },
  });

  // 데모 엔터 스태프 1명 — 같은 소속사라 두 배우 모두 모니터링 가능
  const staff = await prisma.user.create({
    data: {
      ...AGREED,
      role: Role.AGENCY_STAFF,
      displayName: '데모 소속사 스태프',
      email: 'staff@toffee.demo',
      agencyId: demoAgency.id,
    },
  });
  // 이전 소속사 스태프 — 누가가 이적했으므로 누가의 콘솔/메시지에 접근하면 403이어야 함
  await prisma.user.create({
    data: {
      ...AGREED,
      role: Role.AGENCY_STAFF,
      displayName: '이전 소속사 스태프',
      email: 'former-staff@toffee.demo',
      agencyId: formerAgency.id,
    },
  });

  const admin = await prisma.user.create({
    data: {
      ...AGREED, role: Role.ADMIN, displayName: '데모 운영자', email: 'admin@toffee.demo' },
  });

  // 배우 본인 계정 — 메시지·스토리 발송은 이제 이 계정만 할 수 있음(소속사는 열람 전용)
  await prisma.user.create({
    data: {
      ...AGREED, role: Role.ACTOR, displayName: '캐러멜(본인)', email: 'caramel-self@toffee.demo' },
  });
  await prisma.actor.update({
    where: { id: caramel.id },
    data: { selfUser: { connect: { email: 'caramel-self@toffee.demo' } } },
  });

  // 팬 2명 — fan1은 caramel만, fan2는 둘 다 구독(CP 할인 시나리오). 가입 절차(생년월일)까지 마친 성인 팬으로 —
  // 생년월일이 없으면 로그인하자마자 온보딩 화면만 나오고, 서버도 구독을 막음(2026-09-28)
  const ADULT = { birthDate: new Date('2000-03-03') };
  const fan1 = await prisma.user.create({
    data: {
      ...AGREED, ...ADULT, role: Role.USER, displayName: '민지', nickname: '캐러멜바라기', email: 'fan1@toffee.demo' },
  });
  const fan2 = await prisma.user.create({
    data: {
      ...AGREED, ...ADULT, role: Role.USER, displayName: '수아', nickname: '누가누가', email: 'fan2@toffee.demo' },
  });

  // 묶음 상품(2026-09-29) — 캐러멜 + 누가를 개인 구독 합계(฿198)보다 싸게
  const pairBundle = await prisma.bundle.create({
    data: {
      name: '캐러멜 + 누가',
      priceCents: 15900,
      actors: { create: [{ actorId: caramel.id }, { actorId: nougat.id }] },
    },
  });

  // 구매(결제 단위)와 방 이용권(Subscription)을 같이 — fan1은 캐러멜 개인 구독, fan2는 묶음으로 두 방
  await prisma.purchase.create({ data: { userId: fan1.id, actorId: caramel.id, priceCents: caramel.monthlyPriceCents, startedAt: daysAgo(5) } });
  await prisma.purchase.create({ data: { userId: fan2.id, bundleId: pairBundle.id, priceCents: pairBundle.priceCents, startedAt: daysAgo(20) } });
  const fan1Sub = await prisma.subscription.create({
    data: { userId: fan1.id, actorId: caramel.id, startedAt: daysAgo(5) },
  });
  await prisma.subscription.create({
    data: { userId: fan2.id, actorId: caramel.id, startedAt: daysAgo(20) },
  });
  await prisma.subscription.create({
    data: { userId: fan2.id, actorId: nougat.id, startedAt: daysAgo(20) },
  });
  // 해지된 구독도 하나 넣어서 "방송 대상에서 제외되는지" 확인용
  await prisma.purchase.create({ data: { userId: fan1.id, actorId: nougat.id, priceCents: nougat.monthlyPriceCents, startedAt: daysAgo(30), cancelledAt: daysAgo(2) } });
  const fan1NougatSub = await prisma.subscription.create({
    data: { userId: fan1.id, actorId: nougat.id, startedAt: daysAgo(30) },
  });
  await prisma.subscription.update({
    where: { id: fan1NougatSub.id },
    data: { cancelledAt: daysAgo(2) },
  });

  // fan1의 구독(5일 전) 이전/이후 메시지를 둘 다 넣어서 열람 제한 로직을 실제로 검증할 수 있게 함
  await prisma.message.create({
    data: {
      actorId: caramel.id,
      senderType: MessageSenderType.ARTIST,
      body: '{{name}}야 반가워! (이건 구독 전 메시지라 fan1에겐 안 보여야 함)',
      createdAt: daysAgo(10),
    },
  });
  const recentBroadcast = await prisma.message.create({
    data: {
      actorId: caramel.id,
      senderType: MessageSenderType.ARTIST,
      body: '{{name}}야 오늘 하루 어땠어? 나는 촬영 잘 마쳤어!',
      createdAt: daysAgo(1),
    },
  });
  await prisma.message.create({
    data: {
      actorId: caramel.id,
      senderType: MessageSenderType.ARTIST,
      mediaType: MessageMediaType.PHOTO,
      mediaUrl: 'https://placehold.co/800x800?text=Selfie',
      body: '오늘 셀카 📸 (플레이스홀더 이미지)',
      createdAt: daysAgo(1),
    },
  });
  const fanReply = await prisma.message.create({
    data: {
      actorId: caramel.id,
      senderType: MessageSenderType.FAN,
      fanUserId: fan1.id,
      replyToMessageId: recentBroadcast.id,
      body: '오빠 오늘도 화이팅!',
      createdAt: daysAgo(1),
    },
  });
  await prisma.subscription.update({
    where: { id: fan1Sub.id },
    data: { lastArtistMessageAt: daysAgo(1), lastFanReplyAt: daysAgo(1) },
  });

  // 신고/모더레이션 큐 데모용
  await prisma.report.create({
    data: {
      messageId: recentBroadcast.id,
      reportedById: fan2.id,
      category: 'SPAM',
      reason: '(데모) 스팸성 메시지로 신고',
    },
  });

  // 금칙어 데모(실제 욕설 대신 테스트용 문자열 — 관리자 화면에서 등록/삭제 확인용)
  await prisma.bannedWord.createMany({
    data: [
      { term: '테스트금칙어', language: 'ko' },
      { term: 'testbadword', language: 'en' },
      { term: 'ทดสอบคำต้องห้าม', language: 'th' },
    ],
  });

  console.log('시드 완료:', {
    actors: [caramel.chatDisplayName, nougat.chatDisplayName],
    agencies: [demoAgency.name, formerAgency.name],
    staff: staff.displayName,
    admin: admin.displayName,
    fans: [fan1.displayName, fan2.displayName],
    sampleFanReplyId: fanReply.id,
    actorSelfLoginEmail: 'caramel-self@toffee.demo',
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
