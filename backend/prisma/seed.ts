// 데모/개발용 시드 데이터 — 전부 가상의 배우/팬이며 실제 배우 정보는 계약 전까지 절대 넣지 않음.
// 실행: npx prisma db seed
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { MessageSenderType, MessageMediaType, Role } from '../src/generated/prisma/enums.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function main() {
  // 기존 시드 데이터 정리 (FK 순서대로)
  await prisma.report.deleteMany();
  await prisma.messageTranslation.deleteMany();
  await prisma.message.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.authIdentity.deleteMany();
  await prisma.glCp.deleteMany();
  await prisma.actor.deleteMany();
  await prisma.user.deleteMany();

  // 가상의 배우 2명 — 이름/사진 전부 가상, Toffee 캔디 테마로 지음
  const caramel = await prisma.actor.create({
    data: {
      legalName: '(가상) 데모 배우 A',
      officialProfileImageUrl: 'https://placehold.co/600x800?text=Caramel',
      chatDisplayName: '캐러멜',
      chatProfileImageUrl: 'https://placehold.co/400x400?text=%EC%BA%90%EB%9F%AC%EB%A9%9C',
      monthlyPriceCents: 9900, // 데모 가격 — 실제 태국 시장 가격은 별도 검증 필요
    },
  });

  const nougat = await prisma.actor.create({
    data: {
      legalName: '(가상) 데모 배우 B',
      officialProfileImageUrl: 'https://placehold.co/600x800?text=Nougat',
      chatDisplayName: '누가',
      chatProfileImageUrl: 'https://placehold.co/400x400?text=%EB%88%84%EA%B0%80',
      monthlyPriceCents: 9900,
    },
  });

  // 팬에게 노출 안 되는 내부 CP 페어링 — 둘 다 구독하면 15% 할인
  await prisma.glCp.create({
    data: { actorOneId: caramel.id, actorTwoId: nougat.id, discountPercent: 15 },
  });

  // 소속사 스태프 1명이 두 배우를 같이 관리 (파일럿 규모 가정)
  const staff = await prisma.user.create({
    data: {
      role: Role.AGENCY_STAFF,
      displayName: '데모 소속사 스태프',
      email: 'staff@toffee.demo',
      staffOfActors: { connect: [{ id: caramel.id }, { id: nougat.id }] },
    },
  });

  const admin = await prisma.user.create({
    data: { role: Role.ADMIN, displayName: '데모 운영자', email: 'admin@toffee.demo' },
  });

  // 팬 2명 — fan1은 caramel만, fan2는 둘 다 구독(CP 할인 시나리오)
  const fan1 = await prisma.user.create({
    data: { role: Role.USER, displayName: '민지', email: 'fan1@toffee.demo' },
  });
  const fan2 = await prisma.user.create({
    data: { role: Role.USER, displayName: '수아', email: 'fan2@toffee.demo' },
  });

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
      reason: '(데모) 스팸성 메시지로 신고',
    },
  });

  console.log('시드 완료:', {
    actors: [caramel.chatDisplayName, nougat.chatDisplayName],
    staff: staff.displayName,
    admin: admin.displayName,
    fans: [fan1.displayName, fan2.displayName],
    sampleFanReplyId: fanReply.id,
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
