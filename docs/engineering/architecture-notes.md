# 아키텍처 노트

젤리(gelly) 대비 갭과, 지금 진행 중인 스키마/권한 설계를 "현재 기준"으로 정리. 각 결정이
왜 나왔는지의 맥락은 `docs/deployment-readiness-plan.md`의 해당 날짜 항목 참고.

## 젤리 대비 갭 (2026-09-18 기준)

| 항목 | 상태 |
|---|---|
| 앱 dev/prod 빌드 분리 (`app.config.ts` + `eas.json` 멀티 프로필) | 미착수 |
| Sentry (백엔드+앱) | **완료 (2026-09-28)** — 아래 "CI + Sentry" 절 |
| CI/CD (`.github/workflows`), 자동 DB 백업 | CI **완료 (2026-09-28)**. 배포(CD)·DB 백업은 호스팅 결정 후 |
| 헬스체크 (`/health/live` 분리) | 미착수 |
| 루트 `CLAUDE.md`, README 컨벤션 문서화 | **이번에 해결** (`CLAUDE.md` 신설) |
| `Actor` 다국어 필드, 앱 i18n 라이브러리 | 앱 i18n **완료 (2026-09-28)**. `Actor`/`Agency` 같은 DB 콘텐츠 다국어는 미착수 |
| 브랜드 팔레트/폰트 적용 | **완료** — `app/src/constants/theme.ts`, Pretendard(한·영) + Noto Sans Thai(태) |

## 배우 본인 계정 (`Role.ACTOR`) — 구현 완료 (2026-09-18)

- `Role.ACTOR` 추가, `Actor.selfUserId`(1:1, 배우 본인 계정) 필드 신설
  (마이그레이션 `20260918042701_add_actor_self_account`).
- `backend/src/common/authorization/actor-access.ts`에 `ensureIsActorSelf`
  (배우 본인 또는 ADMIN만 — 발송 전용)와 `ensureCanViewActor`(스태프 또는 배우 본인
  또는 ADMIN — 읽기 전용 조회용) 두 헬퍼로 정리. 기존 `ensure-staff-of-actor.ts`는
  삭제하고 이 파일로 통합함.
- `POST /actors/:id/messages/broadcast`: `@Roles(AGENCY_STAFF, ADMIN)` →
  `@Roles(ACTOR, ADMIN)` + `ensureIsActorSelf`로 교체 완료 — 소속사는 더 이상
  발송 불가.
- `GET /actors/:id/messages/replies`, `GET /actors/:id/stats`, `GET /actors/mine`:
  `AGENCY_STAFF`에 `ACTOR`를 추가하고 `ensureCanViewActor`로 교체 — 배우 본인도
  자기 답장/통계를 볼 수 있음.
- `prisma/seed.ts`에 데모 배우 본인 계정(`caramel-self@toffee.demo`, role `ACTOR`,
  `caramel.selfUserId`로 연결) 추가 — `dev-login`으로 로그인해서 실제 발송 테스트 가능.
- **아직 안 한 것**: 배우 전용 업로드/작성 화면(카메라 촬영 → 즉시 업로드, 메시지
  작성) 자체와 그 진입점(앱 `_layout.tsx`의 `AuthGate`가 지금 `ACTOR` role을 아무데도
  리다이렉트하지 않음 — 로그인해도 팬 화면으로 빠짐). 다음 세션에서 화면 설계 필요.

## `Story`/`StoryView` 모델 — 구현 완료 (2026-09-18)

스키마는 설계안 그대로 반영됨(마이그레이션 `20260918043620_add_story_and_video_media_type`).
`backend/src/stories/`에 모듈 추가:

- `POST actors/:actorId/stories` — `@Roles(ACTOR, ADMIN)` + `ensureIsActorSelf`.
  `CreateStoryDto`가 `mediaType !== TEXT`를 검증(스토리는 항상 미디어 있음).
- `GET actors/:actorId/stories` — 로그인만 하면 접근 가능하되 서비스 내부에서
  `ensureActiveSubscription`으로 구독 여부 확인, `expiresAt > now()`인 것만
  `createdAt asc`로 반환.
- `POST actors/:actorId/stories/:storyId/view` — `StoryView.upsert`로 조회 기록
  (중복 호출 안전).
- `GET actors/:actorId/stories/:storyId/views` — `@Roles(AGENCY_STAFF, ACTOR, ADMIN)`
  + `ensureCanViewActor`, 조회한 팬 목록(`viewedAt desc`) 반환.
- 메시지 서비스에 있던 활성 구독 체크를
  `common/authorization/ensure-active-subscription.ts`로 추출해서 재사용.

**버그 수정**: `MessageMediaType`에 `VIDEO`가 없었음(`TEXT`/`PHOTO`/`AUDIO`뿐 —
디자인 가이드는 영상 메시지도 요구). 스토리 작업 중 발견해서 enum에 추가, `Message`
모델의 영상 전송도 이걸로 같이 고쳐짐.

**만료 스토리 정리 cron — 구현 완료 (2026-09-18)**: `@nestjs/schedule` 추가,
`StoriesModule`에 `StoryCleanupService.removeExpiredStories()`가 매시간
(`CronExpression.EVERY_HOUR`) 만료된 `Story` 레코드를 삭제(`StoryView`는
`onDelete: Cascade`로 같이 지워짐). **스토리지 파일 삭제는 여전히 안 함** —
Supabase Storage 같은 실제 파일 저장소 자체가 코드에 연동돼 있지 않아서,
`mediaUrl`이 가리키는 파일은 그대로 남음(스토리지 프로바이더 연동 이후에 후속
작업으로).

**아직 안 한 것**:
- 배우 전용 업로드 화면(카메라 촬영 → 즉시 업로드)과 그 진입점 — `Role.ACTOR` 절
  참고, 여전히 미착수.

## 소속사 모니터링 기능 — 백엔드 구현 완료 (2026-09-18)

- `PushService.notifyActorStaff(actorId, title, body)` 신규 — ~~`Actor.staff` 전원에게~~
  (2026-09-28부터) 배우의 현재 소속사(`Actor.agencyId`)에 속한 `AGENCY_STAFF` 전원에게
  best-effort로 푸시. `sendBroadcast`, 스토리 `create` 양쪽에서 팬 알림과 별개로 호출.
- `GET actors/:actorId/messages/broadcasts`(신규, `AGENCY_STAFF/ACTOR/ADMIN`) — 배우가
  보낸 메시지를 `{{name}}` 치환 없이 원문 그대로 반환(`ensureCanViewActor`).
- `stories.listActive`가 `requesterRole`을 받아서, `AGENCY_STAFF/ACTOR/ADMIN`이면
  `ensureCanViewActor`로(구독 여부 무관하게 모니터링 목적 접근), 일반 팬이면 기존대로
  `ensureActiveSubscription`으로 분기.
- **아직 안 한 것**: 앱/웹 쪽에 이 엔드포인트들을 실제로 보여주는 화면 자체가 없음
  (지금은 API만 존재). 팬 개인정보 노출 범위(답장의 "팬 이름"이 닉네임/실명인지)도
  여전히 미확인.

## 붙이지 않은 업로드 파일 정리 (2026-09-28)

- `UploadCleanupService.removeOrphanUploads` — `@Cron('30 4 * * *', { timeZone: 'Asia/Bangkok' })`. `actors/`·`agencies/`
  아래 객체를 `StorageService.listObjects`(ListObjectsV2, 1000개씩)로 훑어서, 24시간 넘었고 DB(Message·Story
  `mediaKey`, Actor 사진, Agency 로고)에서 안 쓰는 키면 삭제. 저장소 미설정이면 건너뜀. 참조 키는 한 번에 읽음(파일럿
  규모) — 커지면 prefix(배우)별로 나눠 확인할 것. 새로 파일을 참조하는 컬럼을 만들면 `referencedKeys`에 꼭 추가.
- 버킷 수명주기 규칙(ops-infra-backlog)은 이걸로 대체 가능하지만, 안전망으로 같이 두는 걸 권장.

## 대화기록 1년 보존 (2026-09-28)

- `MessageRetentionService.removeExpiredFanReplies` — `@Cron('10 4 * * *', { timeZone: 'Asia/Bangkok' })`.
  `DELETE FROM "Message" USING "Subscription"`로 같은 (팬, 배우)의 구독이 `cancelledAt < now - 365일`인 FAN 메시지 삭제,
  PENDING 신고가 걸린 건 제외. 스타의 인용은 `replyToMessageId` SetNull → "삭제된 메시지".
- 검증: 로컬 DB에 400일 전 해지·30일 전 해지·재구독·신고 대기 4가지를 넣고 실행 → 400일 건만 삭제.

## 배우별 알림 끄기 (2026-09-28)

- `Subscription.notificationsMuted`(마이그레이션 `20260928150000_add_subscription_notifications_muted`),
  `PATCH /actors/:actorId/subscribe/notifications { muted }`. `sendBroadcast`의 팬 푸시 대상 조회에
  `notificationsMuted: false`(단위 테스트). 소속사 스태프 알림(`notifyActorStaff`)은 영향 없음.
- 앱: 채팅방 헤더 🔔/🔕(`useSetNotificationsMuted`, 낙관적 갱신), 대화 목록에 🔕.

## 운영자 통계 (2026-09-28)

- `GET /admin/stats/summary`(앱 홈 숫자), `GET /admin/stats/daily?days=7..90`(일별 추이), `GET /admin/stats/breakdown`
  (국가·가입 기기·언어·가입 경로·배우별) — `AdminStatsService`. 하루 경계는 `Asia/Bangkok`(UTC+7 고정), 일별 집계는
  `$queryRawUnsafe`로 `to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')`.
- 팬 통계는 `role = USER`·`deletedAt IS NULL`만. 구독률 = 활성 구독이 하나라도 있는 팬 / 전체 팬. 접속은
  `User.lastActiveAt`(1시간 단위 갱신) 기준이라 "오늘/30일 접속자"만 가능(과거 일별 접속자는 기록 안 함).
  가입 경로는 사용자별 첫 `AuthIdentity.provider`(개발용 이메일 로그인 계정은 안 잡힘). 신규 구독 금액은
  `SubscriptionEvent.priceCents` 합(결제 연동 후 실제 매출·갱신은 별도).
- 앱: `admin/stats.tsx`(폭 900px 이상이면 2열), 차트는 라이브러리 없이 View로 그린 `components/simple-charts.tsx`.

## 답장 횟수 제한·스타 메시지 삭제·운영자 가림 (2026-09-28)

- 스키마(`20260928140000_add_message_deletion`): `Message.deletedAt`, `deletedByAdmin`(소프트 삭제 — 모니터링 기록·신고 증거용).
- 답장 제한: `MessagesService.replyTarget`(구독 이후 가장 최근의 지워지지 않은 스타 메시지 + 그 메시지에 이 팬이 보낸
  답장 수), `FAN_REPLIES_PER_MESSAGE`(기본 3) 넘으면 400. `GET /actors/:id/messages/reply-quota` → `{ messageId,
  limit, used, remaining }`(팬 입력창 위 표시, 5초 폴링). 단위 테스트 4개.
- 삭제: `DELETE /actors/:actorId/messages/:messageId`(ACTOR 본인·ADMIN, 스타 메시지만) → `deletedAt`. 신고가 걸려
  있지 않으면 첨부 파일도 삭제. `listForFan`은 `deletedAt: null`만, `listBroadcasts`(스튜디오·콘솔)는 전부 내려주고
  앱이 표시를 나눔(스튜디오: 내가 지운 건 숨김, 운영자 가림은 표시 / 콘솔: 둘 다 라벨과 함께 표시).
- 운영자 가림: `ReportsService.resolve`에서 신고 대상이 스타 메시지면 `deletedAt + deletedByAdmin: true`(같은 트랜잭션).

## 미성년 국가별 기준·통계 기록 (2026-09-28)

- 스키마(`20260928130000_add_country_activity_and_subscription_events`): `User.countryCode`, `signupPlatform`,
  `lastActiveAt`, `SubscriptionEvent { userId, actorId, type: STARTED|CANCELLED, priceCents, createdAt }`.
- 국가: 앱이 약관 동의(`POST /me/terms-agreement`) 때 `expo-localization`의 `regionCode`·`Platform.OS`를 보냄 →
  처음 한 번만 저장(`normalizeCountryCode`, 두 글자 아니면 null). 기존 계정은 null → 기본값 적용.
- 동의 나이: `parental-consent/minor-age.ts`의 `CONSENT_AGE_BY_COUNTRY`(KR 14, TH 20), 없으면 `DEFAULT_CONSENT_AGE`
  20. 생년월일 입력 시 `consentAgeFor(user.countryCode)`로 판정.
- 이력: `SubscriptionsService.subscribe`/`verifyPurchase`(새 시작일 때만)/`unsubscribe`, 탈퇴 시 활성 구독마다
  CANCELLED. `lastActiveAt`은 JWT 검증에서 1시간 지났을 때만 비동기 갱신.
- 가입 경로(소셜 종류)는 `AuthIdentity.provider`+`createdAt`으로 계산 가능(별도 컬럼 안 만듦).

## 약관 동의·회원 탈퇴·문의하기 (2026-09-28)

- 스키마(`20260928120000_add_terms_consent_and_account_deletion`): `User.termsVersion`, `termsAcceptedAt`, `deletedAt`.
- 약관 동의: `CURRENT_TERMS_VERSION`(`backend/src/common/legal/terms.ts`, 앱 `TERMS_VERSION`과 같이 올릴 것).
  `GET /me/onboarding-status`에 `needsTerms`(모든 역할), `POST /me/terms-agreement { version, agreeTerms: true,
  agreePrivacy: true }`. 소셜 로그인의 `agreedToTerms` 파라미터는 제거(기록도 안 하던 값) — 동의는 로그인 방식과
  무관하게 온보딩 첫 단계에서. AuthGate는 온보딩 중에도 `/terms`·`/privacy`는 열 수 있게 허용.
- 탈퇴: `DELETE /auth/me`(USER만) — 구독 해지 처리, 푸시 기기·부모 동의 삭제, 개인정보 필드 null, `deletedAt`.
  BANNED가 아니면 `AuthIdentity` 삭제(같은 소셜로 새 가입 가능), BANNED면 남겨서 재가입 차단. JWT 검증에서
  `deletedAt`이면 401("탈퇴한 계정"). 팬 답장 목록·인용에서 탈퇴한 팬은 `fanUser: null`/가림. 운영자 회원 목록에 탈퇴 표시,
  탈퇴 계정 역할 변경 불가.
- 문의하기: 앱 `EXPO_PUBLIC_SUPPORT_EMAIL`(없으면 "준비 중"), `lib/support.ts`가 회원번호·앱 버전을 본문에 넣어 mailto.
- 시드 데모 계정은 동의 완료 상태로 생성(`AGREED`).
- 마이페이지를 ScrollView로 바꿈(항목이 늘어서 작은 화면에서 잘림 방지).

## 배우 닉네임·대화방 사진 (2026-09-28)

- `Actor.chatDisplayName` = 배우가 직접 정하는 닉네임(컬럼명은 그대로). `PATCH /actors/:id/nickname`(ACTOR 본인·
  ADMIN, `ensureIsActorSelf`): `normalizeNickname` + 금칙어 + 다른 배우의 chatDisplayName/legalName과 같으면 409.
  쿨다운 없음. 소속사는 불가(발송 권한과 같은 선).
- 대화방 사진: `POST /actors/:id/chat-profile-image/upload`, `PATCH /actors/:id/chat-profile-image { key|null }` —
  `ensureCanViewActor`(본인·같은 소속사 직원·ADMIN). 이미지 교체 로직은 `ActorsService.updateImages`로 옮겨서
  운영자 API(`AdminActorsService.updateImages`)도 이걸 호출.
- `Actor.verified`는 컬럼·운영자 토글만 남아 있고 팬 응답엔 안 내려줌(배지 안 하기로 결정). 필요 없으면 나중에 정리.
- 앱: `studio/[actorId]/profile.tsx`(닉네임·사진·로그아웃, 채팅방 헤더 오른쪽 "프로필"), `components/chat-photo-editor.tsx`
  (스튜디오 프로필·콘솔 모니터링 화면 공용).
- 발견: 채널이 하나인 배우는 `/studio`가 곧장 채팅방으로 넘어가서 로그아웃 버튼(스튜디오 목록에만 있음)이 안
  보였음 → 프로필 화면에 로그아웃 추가.

## 운영자 배우·소속사·계정 관리 (2026-09-28)

- API(`@Roles(ADMIN)`): `GET/POST /admin/actors`, `GET/PATCH /admin/actors/:id`(이름·대화방 이름·구독료(사타앙)·`verified`),
  `PATCH /admin/actors/:id/images { officialProfileImageKey?, chatProfileImageKey? }`(null=삭제), `PATCH
  /admin/actors/:id/self-user { userId|null }`(ACTOR 역할 계정만, 한 계정은 배우 한 명), `POST /admin/uploads
  { target: ACTOR|AGENCY, targetId, contentType, sizeBytes }`(사진만), `GET /admin/agencies`(배우·직원 수),
  `PATCH /admin/users/:id/role { role: USER|ACTOR|AGENCY_STAFF }`, `GET /admin/users?role=`. 소속사 이적은 기존
  `PATCH /admin/actors/:id/agency`(이력 트랜잭션) 그대로 — 배우 등록 시 `agencyId`를 주면 같은 경로로 이력 생성.
- **프로필 이미지 저장 방식**: `Actor.officialProfileImageUrl`/`chatProfileImageUrl`/`Agency.logoUrl` 컬럼은 그대로 두고
  값으로 외부 주소(http…, 시드 데이터) **또는 저장소 키**를 받음(`isStorageKey`). 응답 시 `MediaService.resolveImageUrl`로
  키 → 서명 URL(1시간 단위로 같은 URL이라 캐시 유지) — 버킷은 계속 비공개, 스키마 변경 없음. 적용 지점:
  `ActorsService.withImageUrls`(목록·상세·mine), `AgenciesService`, `SubscriptionsService.listMine`, 운영자 응답.
  새로 이미지 필드를 내려주는 API를 만들면 반드시 여기를 거칠 것(키가 그대로 나가면 앱에서 이미지가 깨짐).
- 경로: 배우 사진 `actors/{id}/profile/`, 소속사 로고 `agencies/{id}/logo/`(`profileImagePrefix`). 첨부 시
  `MediaService.verifyAt`(경로·매직 넘버·크기). 사진을 바꾸면 이전 파일은 다른 필드에서 안 쓰일 때만 삭제.
  `MediaService.createUpload/verifyForAttach`는 `createUploadAt/verifyAt`의 배우 메시지용 래퍼가 됨.
- 역할 변경 규칙(`AdminUsersService.changeRole`): ADMIN 계정 대상·ADMIN으로 승격 불가, 활성 구독이 있으면 ACTOR/
  AGENCY_STAFF로 변경 불가, ACTOR에서 바뀌면 `Actor.selfUserId` 해제, AGENCY_STAFF가 아니게 되면 `agencyId` null.
- 소속사 로고는 소속사 생성 후에만(업로드 경로에 id 필요) — 생성 시 저장소 키를 주면 400.
- 앱: `admin/actors/index|new|[id].tsx`, `admin/agencies.tsx`, `admin/users.tsx`(역할·직원 소속사), 공용 조각
  `components/admin-ui.tsx`, 업로드 `uploadProfileImage`(`lib/upload-media.ts`).
- 검증: 실서버(등록·없는 소속사로 등록 시 롤백, 이력, 업로드→서명 URL 200, 다른 경로 키 거절, 사진 공유 시 삭제 안 함,
  역할 변경 제한 3종, 계정 연결 제한 2종, 로고 업로드/거절, 이적 이력) + 브라우저(등록→상세, 사진 올리기, 이적 확인창,
  구독 중인 팬 역할 변경 거절 표시). 단위 테스트 2개 추가(24개).

## 신고·차단 (2026-09-28, 잠정 정책)

- 스키마(마이그레이션 `20260928080000_add_report_category_and_channel_blocks`): `ReportCategory` enum +
  `Report.category`, `Report.reason` 선택으로, `@@unique([messageId, reportedById])`(기존 중복은 마이그레이션에서
  가장 먼저 한 것만 남기고 삭제), `ActorFanBlock { actorId, fanUserId, blockedById, reason }` `@@unique([actorId, fanUserId])`.
- **신고** `POST /reports { messageId, category, reason? }` — 신고자가 그 메시지를 볼 수 있어야 함: 스타 메시지는
  구독 중인 팬만(구독 이후 메시지), 팬 답장은 그 채널의 배우 본인·소속사만(`ensureCanViewActor`), 운영자는 전부.
  자기 메시지 신고 400, 중복 409. 대기열 `GET /reports/pending`은 메시지 단위로 묶어 `reportCount`·`categories`와
  함께 **신고한 사람 수 내림차순**(자동 제재 대신). 처리/기각은 같은 메시지의 대기 신고를 한 번에.
- **차단** `GET|POST /actors/:actorId/blocks`, `DELETE /actors/:actorId/blocks/:fanUserId` — `@Roles(ACTOR,
  AGENCY_STAFF, ADMIN)` + `ensureCanViewActor`, 팬(USER)만 대상. 효과: `sendReply` 403, `listReplies`·`replyCount`에서
  제외(`fanUser.blockedInChannels.none`), 인용 요약에서도 `hidden`(`quoteInclude(actorId)`). 구독·`listForFan`은 영향 없음.
- 앱: `app/report.tsx`(공용 신고 모달), `app/blocks/[actorId].tsx`(차단 관리), `components/fan-reply-actions.tsx`
  (스튜디오·콘솔 답장 줄의 ⋯ → 신고/차단, 차단은 `lib/confirm.ts`로 확인), 팬 채팅의 스타 메시지 옆 ⋯ → 신고,
  운영자 신고 화면에 분류·신고 수·채널·팬 닉네임/로그인 이름.
- 검증: 실서버(정상 신고, 중복 409, 구독 전 메시지 403, 자기 메시지 400, 팬이 다른 팬 답장 403, 이전 소속사 403,
  대기열 정렬, 차단 후 답장 403·열람 200·목록/답장 수에서 제외, 권한 없는 차단 403, 해제 후 답장 201) +
  브라우저(팬 신고 완료 화면, 콘솔에서 차단하면 답장이 목록에서 사라짐, 차단 관리에서 해제, 운영자 목록 표시).

## 인용 답장 (2026-09-28)

- 스키마 변경 없음 — 기존 `Message.replyToMessageId`(팬 답장 자동 연결용으로 이미 추가)를 스타 메시지에도 사용.
  스타 메시지의 `replyToMessageId`가 **FAN 메시지**를 가리키면 인용, 팬 메시지가 스타 메시지를 가리키는 건 자동
  연결(인용 아님).
- `SendBroadcastDto.replyToMessageId?` — 같은 `actorId`의 `senderType=FAN` 메시지만 허용(아니면 400).
- 응답: `QUOTE_INCLUDE`로 `replyTo`(본문·닉네임·팬 상태·RESOLVED 신고 1건)를 같이 읽고 `toQuote`로
  `{ id, hidden, nickname, body(120자) }`만 내려줌. 팬 정지·차단(`status !== ACTIVE`), 신고 RESOLVED,
  팬 계정 없음이면 `hidden: true`로 닉네임·본문 null. 스타 메시지를 가리키는 경우는 `null`(팬 화면에 자동
  연결이 인용처럼 보이지 않게). `listForFan`·`listBroadcasts`·`sendBroadcast` 응답 모두 적용.
- 앱: `components/quote-block.tsx`(말풍선 위 인용), 스튜디오 답장 모아보기의 "답장하기" →
  `router.dismissTo`로 **기존 스튜디오 화면으로 돌아가며** 인용 정보를 params로 전달(처음엔 `navigate`를
  썼다가 스튜디오 화면이 하나 더 쌓여 입력창이 2개 생기는 문제를 테스트에서 발견해 수정), 보내면 params 정리.
- 검증: 단위 테스트(`toQuote` 3개) + 브라우저(스타가 답장하기 → 인용 바 → 전송 → 다른 팬 화면에 "캐러멜바라기님에게
  답장" 표시) + 실서버(인용된 팬 차단 시 hidden 전환, 해제 후 복구, 잘못된 인용 대상 400).

## 닉네임 (2026-09-28)

- `User.nickname String?`, `User.nicknameChangedAt DateTime?`(마이그레이션 `20260928070000_add_user_nickname`).
- 규칙은 `common/nickname/nickname.ts`: `normalizeNickname`(NFC, 공백 정리, 1~20자, `\p{Cc}\p{Cf}` 제어·보이지
  않는 문자 거부, 예약어 포함 거부), `fanTag(userId)` = `#` + id 끝 4자리 대문자, 변경 주기 상수 7일.
  `AuthService.updateNickname`이 추가로 금칙어(`ModerationService`, AuthModule이 ModerationModule import)·배우
  이름 완전일치(`chatDisplayName`/`legalName`, 대소문자 무시)를 검사. 같은 값 재저장은 no-op.
- API: `PATCH /auth/me/nickname`, `GET /auth/me`에 `nickname`·`nicknameChangeAvailableAt`,
  온보딩 상태에 `needsNickname`(USER만).
- 사용처: `{{name}}` 치환과 푸시 `PushRecipient.displayName`은 `nickname ?? displayName`(닉네임 없는 옛
  계정만 로그인 이름으로 폴백), 팬 답장 목록·스토리 열람자 목록은 `fanUser: { id, nickname, tag }`로
  **displayName 제거**(스태프에게 실명 노출 방지). 운영자 신고 목록은 둘 다.
- 앱: `onboarding/nickname.tsx`(AuthGate: 생년월일 → 부모 동의 → 닉네임), `components/nickname-form.tsx`
  (온보딩·마이페이지 공용), `useMe`/`useUpdateNickname`.
- 검증: 단위 테스트 3개 + 실서버(예약어·배우 이름·보이지 않는 문자·금칙어 거절, 중복 허용, 7일 제한,
  `{{name}}`이 닉네임으로, 스태프 답장 목록에 닉네임+태그만) + 브라우저(새 팬 → 닉네임 단계 → 예약어 오류
  표시 → 저장 후 홈 → 마이페이지에 닉네임·변경 가능 날짜).
- 남은 것: 서버 오류 문구가 한국어라 다른 언어 사용자에겐 한국어로 보임(기존 과제와 동일).

## 푸시 알림 — 기기 등록·발송 (2026-09-28)

젤리 방식(@react-native-firebase로 iOS도 FCM 토큰, 서버는 firebase-admin)을 출발점으로 하되 **유료
서비스 기준으로 보강**(사용자 방침: 젤리는 참고만):

- **여러 기기**: `User.fcmToken`(계정당 1개) → `PushDevice { userId, token @unique, platform }`.
  마이그레이션 `20260928060000_add_push_devices`가 기존 토큰을 옮긴 뒤 컬럼 삭제(임시 DB에서 확인).
  같은 토큰을 다른 계정이 등록하면 그 계정으로 옮겨감(같은 폰에서 계정 전환).
- **API**: `PUT /auth/me/push-devices { token, platform }`, `POST /auth/me/push-devices/remove { token }`
  (로그아웃 시 이 기기만 — 남의 기기 토큰으론 아무 일도 안 일어남).
- **발송**: `PushService.sendToUsers(userIds, compose, data)` — 기기마다 받는 사람 언어·이름으로 문구를
  만들어(`buildPushMessages`) FCM `sendEach`로 **500개씩** 발송, `registration-token-not-registered` 등
  죽은 토큰은 즉시 삭제, 실패는 로그만(best-effort). 안드로이드 채널 `messages`(high), iOS 기본 사운드.
  방송 메시지는 구독자 전체를 한 번에 `sendToUsers`로(예전엔 사람마다 DB 조회 + 개별 발송).
- **data**: `{ type: 'NEW_MESSAGE', actorId, messageId }` — 앱이 알림 탭 시 역할별로 이동(팬 `/chat`,
  소속사 `/console`, 배우 `/studio`), 앱 사용 중 수신이면 해당 대화 쿼리만 새로고침.
- **앱**: `lib/push.native.ts`(실제) / `lib/push.ts`(웹 no-op — 웹 푸시는 1차 범위 밖, 네이티브 모듈을
  웹 번들에 안 넣기 위해 파일 분리). `hooks/use-push-notifications.ts`를 루트 `SessionEffects`에서 실행,
  `logout()`이 로그인 토큰을 지우기 전에 `unregisterThisDevice()`.
- **네이티브 설정**: `@react-native-firebase/app`·`messaging`, `expo-notifications`(아이콘 색 브랜드
  Lavender), `expo-build-properties`(iOS `useFrameworks: static` — RNFirebase 요구). `googleServicesFile`
  경로는 잡아뒀고, **개발 변형 파일은 2026-10-01 추가**(Firebase 프로젝트 `toffee-c6cba`, 앱 `com.toffeechat.app.dev`
  안드로이드·iOS → `app/google-services.dev.json`·`app/GoogleService-Info.dev.plist`, 커밋함 — 앱에 박히는 클라이언트
  설정이라 비밀 아님. API 키는 콘솔에서 패키지·번들 ID로 제한 권장). **운영 변형 파일은 아직 없음** — 운영 번들 ID는
  법인 전환 후 등록하기로 했으므로 production 프로필 prebuild는 그때까지 실패하는 게 정상.
- **검증**: 단위 테스트(1,200기기 → 500/500/200 묶음, 죽은 토큰만 삭제, 발송 실패해도 예외 없음, 기기별
  언어·이름), 실서버에서 여러 기기 등록·계정 전환·기기 해제·잘못된 platform 400, 웹 앱 렌더링·로그아웃
  정상. **실제 기기 수신은 Firebase 설정 + 스토어용 빌드 후 확인 필요.**
- 후속: 오래 안 쓴 기기(FCM 기준 270일) 정리, 알림 설정(끄기·미리보기 숨김).

## 음성 메시지 음파·재생 (2026-09-28)

- `Message.mediaDurationMs Int?`, `Message.waveform Json?`(0~1, 최대 64칸 — `SendBroadcastDto`에서
  `@ArrayMaxSize(64)`, 각 값 0~1 검증), 음성일 때만 저장. 마이그레이션 `20260928050000_add_voice_waveform`.
- 스튜디오 녹음: `RecordingPresets.HIGH_QUALITY + isMeteringEnabled`, `useAudioRecorderState(recorder, 100)`로
  100ms마다 dB를 받아 `dbToLevel`(-50dB~0 → 0~1)로 모았다가 보낼 때 `resample`로 48칸(칸별 최대값).
  웹(MediaRecorder + AnalyserNode)도 metering 지원.
- 재생: `components/voice-message.tsx` — `useAudioPlayer(null)`로 빈 플레이어를 만들고 처음 누를 때
  `replace({ uri })`(목록의 모든 음성을 미리 받지 않게, 서명 URL이 바뀌면 다시 연결), 모듈 변수로
  "재생 중인 것 하나만" 유지, `didJustFinish`에 처음으로 되감기. 음파 데이터가 없는 옛 메시지는
  id 해시로 만든 고정 모양(`fallbackWaveform`).
- 검증: 브라우저 가짜 마이크로 4초 녹음 → DB에 48칸·3,990ms 저장 → 팬 화면 재생 중 ❚❚·진행 표시,
  끝나면 ▶로 복귀(Playwright).

## 파일 업로드(미디어 저장소) — 서버 구현 완료 (2026-09-28)

S3 호환 오브젝트 스토리지(운영: Cloudflare R2 예정) + **비공개 버킷 + 서명 URL** 방식. 코드는
`backend/src/storage/`, 앱 헬퍼는 `app/src/lib/upload-media.ts`.

**흐름**
1. `POST /actors/:actorId/uploads { purpose: 'message'|'story', mediaType, contentType, sizeBytes }`
   — `@Roles(ACTOR, ADMIN)` + `ensureIsActorSelf`(발송 권한과 동일, 소속사 불가). 선언한
   형식·크기를 `media-policy.ts` 규칙으로 1차 검사 → 키 `actors/{actorId}/{purpose}/{uuid}.{ext}` →
   10분짜리 PUT 서명 URL(Content-Type·Content-Length 서명 포함) 반환.
2. 앱이 저장소에 직접 PUT(서버를 거치지 않음 — 큰 영상도 백엔드 부담 없음).
3. `POST .../messages/broadcast` / `POST .../stories`에 `mediaKey` 전달 → `MediaService.verifyForAttach`:
   키 경로가 이 배우·이 용도인지(`..` 금지) → HEAD로 존재·크기 → 앞 4,100바이트를 읽어
   `file-type`으로 **실제 형식(매직 넘버)** 판별 → 규칙에 안 맞으면 파일을 지우고 400.
   **외부 URL(`mediaUrl`)은 더 이상 입력으로 받지 않음**(구독자 전용 보장, 핫링크/추적 픽셀 방지).
4. 조회(`listForFan`, `listBroadcasts`, 스토리 `listActive`, 생성 응답)에서 `withReadUrl(s)`가
   `mediaKey` → GET 서명 URL로 바꿔 `mediaUrl`에 넣고 `mediaKey`는 응답에서 제거. 권한 확인은
   기존 조회 API가 이미 하므로(구독/모니터링 권한) URL은 권한 통과 후에만 발급됨.
   서명 시각을 1시간 단위로 맞춰서 같은 시간대엔 URL이 동일 — 채팅방 폴링 때마다 URL이 바뀌어
   이미지 캐시가 깨지는 걸 방지(유효 2시간, 최소 1시간 보장).
5. 만료 스토리 cron이 저장소 파일을 먼저 지우고 DB 삭제(실패해도 DB는 지움).

**스키마**: `Message.mediaKey`, `Story.mediaKey` 추가, `Story.mediaUrl` nullable로(마이그레이션
`20260928030000_add_media_keys`). 둘 중 하나가 미디어 위치 — 시드 데이터는 외부 `mediaUrl` 그대로.

**규칙(잠정)**: 사진 jpeg/png/webp/heic/heif 20MB, 음성 m4a/aac/mp3/webm/ogg 30MB(m4a는 mp4
컨테이너라 판별 결과가 `video/mp4`여도 허용), 영상 mp4/mov/webm 200MB. 스타 앱에서 영상 압축을
붙인 뒤 실제 크기를 보고 조정.

**영상 썸네일(2026-09-28)**: `Message.thumbnailKey`(선택) — 스타 앱이 영상을 보낼 때 첫 장면을 JPEG로 만들어
(`lib/video-thumbnail.native.ts`는 expo-video-thumbnails, `lib/video-thumbnail.ts`는 웹 `<video>`+canvas)
같은 업로드 경로로 PHOTO로 올리고 발송 API에 `thumbnailKey`로 넘김. 서버는 영상일 때만 받아서 PHOTO로 검증,
응답엔 서명된 `thumbnailUrl`. 메시지 삭제 시 같이 지우고, 고아 파일 정리는 참조 중인 키로 취급. 스토리엔 아직 없음.

**설정**: `STORAGE_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/FORCE_PATH_STYLE`
(`.env.example` 참고). 없으면 업로드·첨부는 503(조용히 넘어가지 않음).

**검증**: 로컬 S3 에뮬레이터(moto_server — 이 원격 환경에선 MinIO 바이너리/도커를 못 받아서
대체)로 실서버 E2E: 업로드→발송→팬 조회 시 서명 URL로 받은 바이트가 원본과 동일, 폴링 간 URL 동일,
텍스트 파일을 jpeg로 속이면 400 + 저장소에서 삭제, 형식/용량 초과 400, 다른 용도·없는 키·옛
`mediaUrl` 필드 400, 다른 배우/소속사 스태프/팬의 업로드 요청 403, 스토리 생성·팬 조회, 소속사
모니터링 조회에도 서명 URL, 만료 스토리 정리 시 저장소 파일까지 삭제. 단위 테스트
`media.service.spec.ts`(6개).

**남은 것**
- 앱 화면(사진 고르기·녹음·영상 촬영 → `uploadMedia` → 발송)은 다음 작업 "스타 앱 화면"에서.
- 팬 미디어 재생·다운로드 UI.
- **고아 파일 정리**: 업로드만 하고 발송 안 한 파일은 남음 — DB에 참조 없는 1일 이상 된 객체를
  지우는 cron 필요(버킷 수명주기 규칙은 "첨부된 파일"과 구분 못 해서 부적합).
- **웹 업로드용 버킷 CORS**: Expo web에서 브라우저가 저장소로 직접 PUT하려면 버킷에 CORS
  허용 필요(R2 설정) — 운영 보류 목록에 추가. 네이티브 앱은 CORS 무관.
- 배우 프로필 사진·소속사 로고 업로드는 운영자 전용 `POST /admin/uploads`로 분리(2026-09-28, 아래 "운영자 배우·소속사·계정 관리").
- 게시판/CP방이 생기면 `UPLOAD_PURPOSES`에 추가.
- 대화기록 1년 보존: `MessageRetentionService`(2026-09-28) — 팬 답장만 대상이라 파일 삭제는 없음(팬은 텍스트만).

## 다국어(i18n) 기반 — 구현 완료 (2026-09-28)

**언어 목록**: `ko, th, en, ja, zh-Hans, zh-Hant` — 앱 `app/src/i18n/languages.ts`와 백엔드
`backend/src/common/i18n/locales.ts`를 같은 목록으로 유지할 것. 기본(폴백)은 `en`.

**앱** (`i18next` + `react-i18next` + `expo-localization`):
- 문구 원본은 `app/src/i18n/locales/ko.json`, 나머지 5개 파일에 같은 키(현재 78개). 새 화면은
  처음부터 `const { t } = useTranslation()` + 키로 작성. 키 누락은 영어로 표시됨.
- 기기 언어 감지는 `expo-localization`(젤리는 OTA 때문에 NativeModules를 직접 읽었지만, 토피는
  아직 스토어 빌드 전이고 웹도 지원해야 해서 공식 모듈 사용). 중국어는 `languageScriptCode`
  (Hant/Hans) 우선, 없으면 지역(TW/HK/MO → 번체, 그 외 → 간체).
- `LocalePreferenceProvider`: 기본은 기기 언어를 계속 따라가고, 마이페이지에서 직접 고르면
  고정(`toffee_locale_override`, 네이티브 SecureStore/웹 localStorage — `lib/preference-storage.ts`).
- `useSyncLocale`: 로그인 상태에서 언어가 정해지거나 바뀌면 `PATCH /auth/me/locale`.
- 날짜는 `toLocaleDateString(i18n.language)` — 태국어는 불기(2569년) 표기로 나옴(태국 현지
  관행이라 그대로 둠). 가격은 `price.perMonth`/`price.amount` 키(통화는 ฿ 고정).
- **의도적으로 한국어만 둔 것**: 운영자(ADMIN) 화면 4개(운영자 본인 전용), 약관/개인정보처리방침
  **본문**(변호사 검토 후 최종본을 언어별로 — 지금은 초안 안내 + "한국어만 제공" 안내만 다국어).
- 서버가 돌려주는 에러 메시지(`ApiError.message`)는 아직 한국어 — 화면에 그대로 뜨는 곳이
  있음(구독 실패 사유 등). 후속 작업.

**백엔드**:
- `User.locale String?`(마이그레이션 `20260928020000_add_user_locale`), `GET /auth/me`가
  `{ id, role, locale }` 반환(원래는 JWT의 `{id, role}`만), `PATCH /auth/me/locale`(`@IsIn`).
- 푸시: `PushService.sendToUser(userId, compose)` / `notifyActorStaff(actorId, compose)` —
  문구를 고정 문자열 대신 `compose({ locale, displayName })` 함수로 받아 **받는 사람별로** 조립.
  문구 사전은 `notifications/push-messages.ts`.
- 팬 새 메시지 푸시는 카톡처럼 제목 = 배우 대화방 이름, 본문 = 메시지 미리보기(60자). 본문이
  없는 미디어는 "사진을 보냈어요" 등 받는 사람 언어로.
- **버그 수정**: 원래 팬 푸시 본문에 `{{name}}`이 치환 안 된 채 그대로 나가고 있었음 —
  `listForFan`에서만 치환하고 푸시엔 원문을 넣었던 것. 이제 받는 팬 이름으로 치환(스태프
  모니터링 푸시는 원문 유지). `messages.service.spec.ts`로 회귀 테스트.

**번역 품질**: th/ja/zh-Hans/zh-Hant 문구는 전부 기계 작성(원어민 검수 전) — 운영 보류 목록에
검수 항목으로 올림.

**검증**: 로컬 Postgres 마이그레이션(드리프트 0) → 실서버에서 `PATCH /auth/me/locale` 정상/
잘못된 값 400 확인 → Expo web + Playwright로 브라우저 언어 th-TH/zh-TW/zh-CN/fr-FR 각각
태국어/번체/간체/영어(폴백)로 뜨는 것, 마이페이지에서 日本語 선택 시 즉시 전환 + 새로고침 후
유지 + 서버 `User.locale` 갱신 확인.

**남은 것**: DB 콘텐츠 다국어(`Actor` 이름·소개, `Agency` 이름 — 지금은 입력한 언어 그대로
표시), 서버 에러 메시지 다국어(에러 코드 방식 검토), 태국 사용자가 생년월일에 불기 연도(2548
등)를 입력하는 경우 처리.

## CI + Sentry — 구현 완료 (2026-09-28)

**CI** (`.github/workflows/ci.yml`) — 처음엔 모든 브랜치 push에 돌렸으나, 같은 날 사용자
GitHub Actions 무료 시간(개인 계정의 private 저장소 전체 합산 — 젤리의 EAS 빌드/백업/OTA와 같이
씀) 한도 문제로 **main 대상 PR/push + 수동 실행(workflow_dispatch)만**으로 축소, 문서만 바뀐
변경은 건너뜀. 작업 브랜치는 로컬 검사로 대체. (GitHub Organization으로 옮기면 무료 시간이
개인 계정과 별도로 잡힘 — `ops-infra-backlog.md` 참고.)
- `backend`: `npm ci` → `prisma generate/validate` → `tsc --noEmit` → `npm run lint`(oxlint)
  → `npm test`(vitest) → `npm run build`.
- `migrations`: Postgres 16 서비스 컨테이너에 `prisma migrate deploy` → `prisma migrate diff
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code`(손으로 쓴 마이그레이션
  SQL이 스키마와 어긋나면 exit 2로 실패 — 일부러 필드를 추가해서 실패하는 것까지 확인) →
  `npm run db:seed`.
- `app`: `npm ci` → `expo-env.d.ts` 생성(gitignore 대상) → `tsc --noEmit` → `eslint src`.
- 배포(CD)·EAS 빌드·DB 백업 워크플로는 호스팅/스토어 설정이 정해진 뒤 젤리 것을 옮겨올 것.
- `.github/dependabot.yml` 같이 추가.

**Sentry 백엔드** (`@sentry/nestjs` 11):
- 백엔드가 ESM이라 젤리처럼 `main.ts` 첫 줄 import로는 초기화 순서가 보장 안 됨 →
  `src/instrument.ts`를 `node --import ./dist/instrument.js dist/main`(`npm run start:prod`)으로
  먼저 로드(Sentry 공식 ESM 방식). `nest start`(개발)로 띄우면 Sentry는 안 켜짐 — 의도된 것.
- `SentryModule.forRoot()` + `APP_FILTER: SentryGlobalFilter` — 처리 안 된 예외(5xx)만 전송,
  `HttpException`(4xx)은 제외.
- PII: v11부터 `sendDefaultPii`가 없어지고 `dataCollection`으로 바뀜 — `userInfo/cookies/
  urlQueryParams: false`, 요청 헤더는 `authorization/cookie/x-api-key` 제외, 응답 바디 미수집.
  2차로 `common/sentry/scrub-event.ts`의 `scrubEvent`(beforeSend)가 바디의 `idToken/
  accessToken/email/parentEmail/birthDate/signedTransaction/purchaseToken/fcmToken` 등을
  재귀적으로 가리고 쿼리스트링·쿠키 제거, `user`는 id만 남김. 단위 테스트
  (`scrub-event.spec.ts`) + 로컬 가짜 Sentry 서버로 실제 전송 확인: DB를 내려 500을 내자
  이벤트 1건(404는 0건)이 왔고 토큰/이메일/쿼리스트링 원문은 하나도 없었음.
- `.env.example`에 `SENTRY_DSN` 추가.

**Sentry 앱** (`@sentry/react-native` ~7.11 — Expo SDK 57 번들 버전, `expo install`이 이
세션 프록시에 막혀서 `bundledNativeModules.json` 기준으로 직접 설치):
- `_layout.tsx`에서 `Sentry.init({ dsn: EXPO_PUBLIC_SENTRY_DSN })` + `Sentry.wrap(RootLayout)`.
- `app.json` 플러그인 `@sentry/react-native/expo`(`organization: toffeechat`,
  `project: toffee-app` — 2026-10-01 토피 전용 Sentry 조직 생성(처음엔 젤리와 같은 개인 조직 `ddururiiiiiii`를 가정했음),
  서버는 같은 조직의 `toffee-backend` 프로젝트). 소스맵 업로드는 EAS 빌드 시 `SENTRY_AUTH_TOKEN`이 있어야 동작.
- 웹 번들(`expo export --platform web`) 정상 생성 확인. 네이티브 빌드는 이 환경에서 확인 불가.

## 소속사(`Agency`) + 소속 이력(`ActorAgencyHistory`) — 구현 완료 (2026-09-28)

마이그레이션 `20260928003000_add_agency_and_actor_agency_history`.

- **스키마**: `Agency { name @unique, logoUrl? }`, `Actor.agencyId?`, `User.agencyId?`
  (AGENCY_STAFF용), `ActorAgencyHistory { actorId, agencyId, startedAt, endedAt? }`
  (`endedAt IS NULL`인 행이 현재 소속). 배우↔스태프 다대다(`_ActorStaff`,
  `Actor.staff`/`User.staffOfActors`)는 **삭제** — 출시 전이라 데이터 이관 없이 드롭.
  FK: `Actor/User.agencyId`는 `SET NULL`, 이력의 `agencyId`는 `RESTRICT`(이력이 있는
  소속사는 못 지움 — 정산 근거 보존), 이력의 `actorId`는 `CASCADE`.
- **권한**: `common/authorization/actor-access.ts`의 `viewableActorsWhere(requester)`
  하나로 통일 — `selfUserId = 본인` OR (`role = AGENCY_STAFF` && `agencyId = 요청자
  agencyId`). `ensureCanViewActor`, `ActorsService.findMine` 둘 다 이걸 씀. 이력 테이블은
  권한 판단에 **쓰지 않음**(이적 후 이전 소속사 접근 차단이 의도된 동작).
  `AuthenticatedUser`에 `agencyId`를 넣지 않고 매번 DB에서 읽음 — 역할과 마찬가지로
  소속 변경이 재로그인 없이 바로 반영되게.
- **팬 공개 API**: `GET /agencies?q=`(이름, 로고, `actorCount`), `GET /agencies/:id`.
  `GET /actors`에 `agencyId` 필터 추가, `q`는 배우 `legalName` + 소속사 `name` 둘 다
  매칭. 배우 목록/상세 응답에 `agency { id, name, logoUrl } | null` 포함.
- **운영자 API** (`admin/admin-agencies.*`, `@Roles(ADMIN)`):
  `POST /admin/agencies`, `PATCH /admin/agencies/:id`(이름 중복은 409),
  `PATCH /admin/actors/:id/agency { agencyId | null }` — `Actor.agencyId` 변경 + 열린
  이력 행 `endedAt` 닫기 + 새 이력 행 생성을 **한 트랜잭션**으로(같은 소속사로 재지정은
  no-op), `GET /admin/actors/:id/agency-history`,
  `PATCH /admin/users/:id/agency { agencyId | null }` — `AGENCY_STAFF`가 아니면 400.
  `agencyId` 필드는 필수(`null`은 무소속으로 되돌리기, 필드 누락은 400).
  **`Actor.agencyId`를 직접 update하지 말 것** — 이력이 어긋남. 반드시
  `AdminAgenciesService.assignActor` 경유.
- **앱**: 배우 찾기 화면에 소속사 필터 칩(가로 스크롤) + 검색 placeholder를 "배우 또는
  소속사 이름"으로, 카드/상세에 소속사명 표시.
- **시드**: `(가상) 데모 엔터테인먼트`(두 배우 소속, `staff@toffee.demo`),
  `(가상) 이전 소속사`(`former-staff@toffee.demo`, 누가가 30일 전 이적해 나간 곳 —
  이 계정으로 누가 콘솔 접근 시 403 확인용).
- **검증**: 로컬 Postgres에 전체 마이그레이션 적용 → DB와 스키마 diff 없음 확인 → 시드 →
  실서버에 curl로 소속사 목록/필터/검색, 스태프·이전 소속사 스태프의 `/actors/mine`과
  `/actors/:id/stats` 403/200, 이적 후 권한이 새 소속사로 넘어가는지, 이력 행이 정확히
  닫히고 열리는지, null 해제/필드 누락/없는 소속사/이름 중복/비스태프 배정 에러를
  전부 확인. 앱은 Expo web + Playwright로 필터 칩·검색·상세 표시 확인.
- **남은 것**: 운영자 앱 화면(소속사 등록/배우 이적/직원 배정) 미구현. 정산용
  결제 원장(`Payment`: 결제 1건 = 1행, 결제 시점의 `agencyId` 스냅샷) 미구현 —
  지금 `Subscription`은 (팬, 배우)당 1행이고 갱신 시 `iapExpiresAt`만 덮어써서 결제
  건별 기록이 없음. 소속사명 다국어는 i18n 설계 때 같이.

## 채팅 미디어 업로드/재생/다운로드 + 인용 답장 — 현황 점검, 구현 전 (2026-09-28)

현재 코드 기준 점검 결과:

- `MessageMediaType`은 `TEXT/PHOTO/AUDIO/VIDEO` 다 있음. `SendBroadcastDto`는
  `mediaType` + `mediaUrl(@IsUrl)`만 받음 — **업로드 경로가 전혀 없음**(presigned URL,
  multer, 스토리지 공급자 모두 미정·미구현. `story-cleanup.service.ts`에도 "스토리지
  연동이 안 돼 있어 파일 삭제는 후속"이라고 남아 있음).
- 팬 답장(`SendReplyDto`)은 `body`만 — 텍스트 전용 요구사항은 이미 충족.
- 앱 채팅방(`app/chat/[actorId].tsx`)은 `PHOTO`만 `<Image>`로 렌더, `AUDIO`는 라벨
  텍스트만, `VIDEO`는 렌더 안 함. `expo-audio`/`expo-video`/`expo-file-system`/
  `expo-media-library`/`expo-image-picker` 전부 미설치.
- `Role.ACTOR` 전용 앱 화면이 없음(`_layout.tsx` 주석 — 지금은 팬 탭으로 빠짐). 즉
  배우가 앱에서 메시지를 보낼 UI 자체가 없음(소속사 콘솔은 발송 권한 제거로 읽기 전용).
- `Message`에 답장 대상 필드 없음, 배우→특정 팬 1:1 메시지 개념 없음(아티스트 메시지는
  `fanUserId` 없는 방송 1건), `listForFan`도 "방송 + 내 답장"만 합쳐서 내려줌.

구현 방향(초안, 제품 결정 후 확정):

1. **스토리지 + 업로드**: S3 호환 스토리지(R2/S3/Supabase 중 택1) presigned PUT →
   클라이언트 직접 업로드 → `mediaUrl`(또는 object key) 저장. MIME·용량 검증은 보안
   하드닝 체크리스트의 "업로드 파일 검증" 항목과 같이. 비공개 버킷 + 조회 시 서명 URL
   발급으로 해야 구독자만 접근 가능(공개 URL이면 링크 공유로 우회됨). 스토리 만료 파일
   삭제도 여기서 같이 해결.
2. **배우 앱 화면**: `ACTOR` 라우팅 + 채팅형 발송 화면(카메라/앨범/녹음 첨부) + 팬 답장
   목록에서 메시지 길게 눌러 "답장".
3. **팬 채팅방 렌더/다운로드**: 사진 전체화면 뷰어, `expo-audio` 재생 바, `expo-video`
   플레이어, `expo-file-system` 다운로드 → `expo-media-library`로 갤러리 저장(웹은
   `<a download>`). 저장 권한 요청 문구는 i18n과 같이.
4. **인용 답장** — 공개 범위 **전체 공개로 확정(2026-09-28)**, 1:1 수신자 필드는 불필요.
   팬 답장(`sendReply`)은 서버가 **그 시점 최신 ARTIST 메시지 id를 자동으로
   `replyToMessageId`에 넣음**(팬이 대상을 고르는 API 없음, 버블 방식) — 스타 화면은
   `GET replies?messageId=`처럼 스타 메시지별로 팬 답장을 묶어서 조회, 스타의 인용 답장만
   명시적 `replyToMessageId`(팬 메시지 id)를 받음. 팬 채팅방 응답에서는 팬 자신의 답장에
   `replyTo`를 굳이 렌더하지 않음.
   `Message.replyToMessageId String?`(self-relation, `onDelete: SetNull` — 원본이
   지워지면 "삭제된 메시지"로 표시) 추가, 응답에 인용 원문 요약(`replyTo { id, body 앞부분,
   mediaType, senderType, fanNickname }`) 포함. 인용된 팬 메시지가 신고 처리됐거나 작성자가
   정지/차단이면 `replyTo` 본문을 가려서 내려줄 것.
   **선행 작업 — `User.nickname`**: 지금 `displayName`은 소셜 로그인 이름
   (`auth.service.ts`에서 Google/Apple/LINE `name`, 네이버/카카오 `nickname`)이라 실명일
   수 있음. `nickname String?`(중복 허용, 금칙어 검사) 추가 + 온보딩에서 필수 입력,
   `{{name}}` 치환(`messages.service.ts`)과 `replyTo.fanNickname` 둘 다 닉네임 사용,
   소속사 답장 모아보기도 닉네임으로 교체(로드맵의 "팬 이름이 닉네임인지 실명인지"
   미확인 항목도 이걸로 해소).

## 관리자(ADMIN) 전용 UI — 아직 전혀 없음 (2026-09-18 확인)

사용자 질문으로 확인된 사실: `ADMIN` role은 모든 엔드포인트에 접근은 가능하지만
(`ensureCanViewActor`/`ensureIsActorSelf`가 ADMIN을 항상 통과시킴), **ADMIN 전용
화면이 웹/앱 어디에도 없음** — 이미 백엔드가 완성된 신고 처리(`reports` 모듈)조차
UI가 없어서 지금은 API를 직접 호출해야만 씀. 곧 만들 콘텐츠 모더레이션/회원 관리도
전부 ADMIN 전용 기능이라, 이 문제를 먼저 정리하지 않으면 계속 "백엔드만 있고 못 쓰는"
기능이 쌓임 — 다음 논의·구현 대상. 제품 관점 결정은 `docs/product/feature-decisions.md`
참고.

## 콘텐츠 모더레이션 / 회원 관리 / 운영자 UI — 구현 완료 (2026-09-18)

마이그레이션 `20260918044811_add_moderation_and_user_status`.

- `BannedWord`(term, language) 모델 + `backend/src/moderation/ModerationService
  .assertNoBannedWords(text)` — 전체 목록을 매번 조회해서 대소문자 무시 부분
  문자열 매치(언어 구분 없이 전체 대조). `messages.service.ts`의 `sendReply()`가
  저장 전에 호출, 걸리면 400으로 거부(마스킹 아님).
- `User.status`(`ACTIVE`/`SUSPENDED`/`BANNED`) + `suspendedUntil`/`bannedAt`.
  `JwtStrategy.validate()`에서 매 요청마다 체크: `BANNED`는 항상 거부,
  `SUSPENDED`는 `suspendedUntil`이 아직 안 지났을 때만 거부 — 기간이 지나면
  상태값을 안 건드려도 자동으로 다시 로그인 가능(별도 재활성화 불필요).
- 신규 `admin` 모듈: `GET/PATCH /admin/users`(목록+검색, `:id/suspend`
  `{ until }`, `:id/ban`, `:id/reactivate`) — 전부 `@Roles(ADMIN)`.
- 신규 `moderation` 모듈의 `BannedWordsController`: `GET/POST/DELETE
  /admin/banned-words` — 전부 `@Roles(ADMIN)`.
- `prisma/seed.ts`에 데모 금칙어 3개(언어별 테스트 문자열, 실제 욕설 아님) 추가.

## 일본어/중국어 답장 검열 — LLM 기반으로, 스펙 확정·구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "일본어/중국어 답장 검열 방식"
절 참고. 한국어/태국어/영어는 기존 `ModerationService.assertNoBannedWords()`
그대로 유지, **일본어/중국어만 LLM 판단으로 대체**하는 하이브리드 구조.

- **분기 방식**: `sendReply()`에서 팬의 언어(또는 답장 텍스트의 감지된 언어)가
  `ko`/`th`/`en`이면 기존 `assertNoBannedWords()`, `ja`/`zh`면 신규
  `ModerationService.assertNotInappropriateViaLlm(text)` 호출. 팬의 "언어"를
  어떻게 판정할지(가입 시 선택한 UI 언어 기준 vs 텍스트 자동 감지)는 구현 시 결정
  필요 — 번역 대상 언어 판정 로직과 통일하는 게 자연스러움.
- **LLM 호출**: 번역 엔진이 아직 미정이라(위 "메시지 번역" 절 참고) 이 판단도 같은
  엔진으로 갈지, 아니면 검열 전용으로 별도 엔진/모델을 쓸지는 번역 엔진 확정 시
  같이 정할 것. 프롬프트는 "이 텍스트가 욕설/음란한 표현을 포함하는가"를
  `true`/`false` 또는 구조화된 출력(`output_config.format`, Claude 기준)으로
  받는 짧은 분류 작업이라 저비용 모델(예: Claude Haiku 4.5)로 충분할 것으로 예상.
- **실패 처리**: LLM 호출이 실패(타임아웃/에러)했을 때 기본 동작을 "차단"과
  "통과" 중 무엇으로 할지 아직 미정 — 안전 우선이면 실패 시 차단(팬에게 재시도
  요청)이 맞아 보이나, 확정은 구현 시.
- 기존 `assertNoBannedWords()`는 변경 없음 — 완전히 별개의 신규 메서드로 추가.

**아직 시작 안 함**: 언어 판정 로직, LLM 호출 서비스, 실패 시 기본 동작 전부
미착수. 번역 엔진이 정해지면 같이 정리하는 게 효율적(같은 LLM API 클라이언트를
재사용할 가능성이 높음).

**앱 쪽 — 운영자 전용 화면 자체가 아예 없었음(신고 처리 기능도 UI 없이 방치돼
있었음)**. `app/src/app/admin/`에 신규:
- `admin/index.tsx` — 메뉴(신고 처리/금칙어 관리/회원 관리) + 로그아웃.
- `admin/reports.tsx` — 기존 `GET /reports/pending` + resolve/dismiss 연결.
- `admin/banned-words.tsx` — 목록 + 추가 폼(언어 선택 칩) + 삭제.
- `admin/users.tsx` — 검색 + 정지(1/3/7일 버튼)/영구차단/재활성화.
- `_layout.tsx`의 `AuthGate`: 로그인 후 분기를 `ADMIN → /admin`,
  `AGENCY_STAFF → /console`, 나머지 → 팬 탭으로 3분기.

**같이 발견해서 고친 회귀**: `console/[actorId].tsx`의 "발송" 탭이 여전히
`useSendBroadcast`(`POST .../broadcast`)를 호출하고 있었는데, 그 엔드포인트는
이전 커밋에서 이미 `AGENCY_STAFF`를 빼고 `ACTOR`/`ADMIN`만 허용하도록 바꿔서
소속사 계정으로는 403이 나는 상태였음. "발송" 탭을 지우고, 새로 만든
`GET .../messages/broadcasts` + `GET .../stories`를 합쳐 보여주는 읽기 전용
"모니터링" 탭으로 교체.

## 사업 운영 체크리스트 항목 — 구현 범위 확정 (2026-09-18)

제품 결정은 `docs/product/business-compliance-checklist.md` 참고. 4개 항목 전부
구현 범위에 포함하기로 함, 아래는 기술 작업 목록(아직 미착수):

- **IAP**: `backend/src/subscriptions/subscriptions.service.ts:20`에 이미
  "결제(IAP)는 계약 성사 후에 붙임 — 지금은 결제 없이 구독 레코드만 만드는 샌드박스
  플로우"라는 주석이 있어서, 애초에 IAP로 갈 계획이었던 것과 일치함. 실제 연동 시
  `react-native-iap`(또는 Expo의 IAP 모듈) + 백엔드 영수증 검증 엔드포인트 필요,
  구독 가격에 앱스토어 수수료(15~30%) 반영 필요.
- **약관/개인정보처리방침 화면**: 앱 `Profile` 메뉴에 "Terms & Privacy" 항목이 이미
  디자인 가이드(`docs/product/brand/DESIGN_GUIDE.md` 10절)에 있음 — 정적 페이지/화면과
  앱스토어 메타데이터 링크 추가 필요. 실제 법률 문구는 변호사 자문 후 채워 넣을 것
  (지금은 placeholder로 화면 뼈대만 만들 수 있음).
- **해외 정산 세무**: 코드 작업 아님, 내부 운영 프로세스 — 정산 배치 로직을 만들 때
  "원천징수분 차감" 여지를 미리 필드로 남겨두는 정도만 고려(예: `Subscription`이나
  향후 정산 모델에 세금 관련 필드).
- **연령/미성년자 정책**: 구현 방식(가입 시 생년월일 입력 후 자기신고 vs 별도 부모
  동의 플로우 등) 미정 — 다음 세션에서 구체화 필요.

## 브랜드 팔레트/폰트 구현 메모

- `app/src/constants/theme.ts`의 `Colors`가 Charcoal(`#0F1115`)/Lavender(`#7C8CFF`)/
  Periwinkle(`#DCE1FF`)/Cloud(`#F4F6FB`)/White로 교체됨.
- (2026-09-28 이후 대체됨 — 아래 "디자인 시스템" 절의 `fontFor` 참고) ~~`Fonts.sans`가 `NotoSansThai_400Regular`를 가리키고
  Regular(400)만 로드~~.
- `Actor.verified Boolean @default(false)` 필드 추가됨(마이그레이션
  `20260918035538_add_actor_verified`). 배지 UI 자체(채팅 헤더, 프로필 화면)는 아직 안 붙임.

## IAP(인앱결제) 검증 — 스캐폴딩 완료, 실 연동 전 (2026-09-18)

`Subscription`에 `iapPlatform`/`iapTransactionId`(unique)/`iapExpiresAt` 추가
(마이그레이션 `20260918070818_add_iap_fields`). `POST /actors/:actorId/verify-purchase`
신규 — 기존 `POST /actors/:actorId/subscribe`(샌드박스, 결제 없음)는 그대로 두고 병행.

- `backend/src/subscriptions/iap-verification.service.ts`:
  - **Apple**: `@apple/app-store-server-library`의 `SignedDataVerifier`로 로컬 검증.
    StoreKit2가 클라이언트에 주는 건 옛날 base64 영수증이 아니라 **서명된 JWS
    트랜잭션**이라, Apple 서버의 `verifyReceipt`(레거시, deprecated)를 호출하는 방식이
    아니라 Apple 루트 인증서(`AppleRootCA-G3.cer`, 최초 호출 시 받아서 프로세스
    메모리에 캐싱)로 서명을 직접 검증하고 페이로드(`originalTransactionId`,
    `expiresDate`)를 디코딩함.
  - **Google**: Play Developer API `purchases.subscriptions.get`을
    `google-auth-library`(이미 Google 로그인용으로 있던 의존성)의 서비스 계정
    액세스 토큰으로 직접 호출 — `googleapis` 패키지 전체를 새로 넣지 않음.
  - 둘 다 필요한 환경변수(`APPLE_BUNDLE_ID`, `APPLE_IAP_ENVIRONMENT`,
    `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`)가 없으면
    `getOrThrow`로 바로 에러 — FCM처럼 조용히 비활성화되지 않음(결제 검증은 절대
    묵시적으로 통과시키면 안 되는 영역이라 의도적으로 이렇게 함).
- 앱: `app/src/hooks/use-purchase.ts`의 `usePurchaseSubscription(actorId)` —
  `expo-iap`의 `useIAP()`로 구매 요청 후 `verify-purchase`에 결과를 넘김.
  **`react-native-iap`가 아니라 `expo-iap`를 씀** — `react-native-iap`(v14+, Nitro
  Modules 기반)는 README에 "Expo Go/Expo Dev Client 미지원, Expo 프로젝트는
  `expo-iap` 쓸 것"이라고 명시돼 있음(처음에 `react-native-iap`를 설치했다가 이
  사실을 확인하고 되돌림 — 같은 실수 반복하지 않도록 기록).
- `app.json` `plugins`에 `"expo-iap"` 추가(별도 옵션 불필요, 기본 StoreKit2 지원).

**아직 실제로 못 하는 것**: 앱스토어 상품(구독) 자체가 등록 안 돼 있어서 이 플로우
전체가 테스트 불가능. 필요한 것: (1) 정식 Bundle ID/패키지명으로 앱스토어/플레이
개발자 계정에 앱 등록, (2) 구독 상품 ID를 `subscriptionSkuForActor()`
(`toffee_sub_{actorId}`) 규칙대로 등록, (3) 위 4개 환경변수 채우기, (4) 실제 EAS
빌드로 기기 테스트(Expo Go/Dev Client에서 결제 자체가 안 됨). 이것들이 끝나기
전까지는 계속 `subscribe`(샌드박스) 플로우를 씀 — `actor/[id].tsx`의 구독 버튼도
아직 `usePurchaseSubscription`으로 안 바꿨음(스토어 준비된 뒤에 교체).

## 법정대리인(부모) 동의 + 약관/개인정보처리방침 화면 — 구현 완료 (2026-09-18)

Bubble 실제 약관("만 14세 미만은 가입 전 법정대리인 동의 필요")을 참고해서 결정 —
14세 미만을 막지 않고 부모 동의 플로우를 구축(마이그레이션
`20260918072541_add_parental_consent`).

- `User.birthDate`/`parentalConsentStatus`(`NOT_REQUIRED`/`PENDING`/`APPROVED`)/
  `parentEmail` + `ParentalConsent`(token, expiresAt, confirmedAt) 모델.
- `PATCH /me/birth-date` — 나이 계산 후 14세 미만이면 `PENDING`으로 전환.
- `POST /me/parental-consent` — 부모 이메일로 확인 링크 발송(`ParentalConsent` upsert).
- `GET /parental-consent/confirm`(`@Public()`) — 부모가 앱 로그인 없이 브라우저에서
  여는 링크, 성공 시 `APPROVED`로 전환.
- `SubscriptionsService.ensureCanSubscribe()` — `PENDING`이면 `subscribe`/
  `verifyPurchase` 둘 다 차단.
- 신규 `EmailService`(Resend REST API 직접 호출) — `RESEND_API_KEY`/
  `EMAIL_FROM_ADDRESS`/`API_PUBLIC_URL` 필요, IAP처럼 미설정 시 조용히 무시하지 않고
  에러(미성년자 보호 장치라 묵시적 우회 방지).
- 앱: `app/src/app/onboarding/{birth-date,parental-consent}.tsx` + `hooks/use-onboarding.ts`.
  `_layout.tsx`의 `AuthGate`가 로그인 직후 `GET /me/onboarding-status`를 확인해서
  생년월일 미입력/`PENDING`이면 온보딩 화면으로 강제 이동.
- 약관/개인정보처리방침: `app/src/app/{terms,privacy}.tsx` — 이번 세션 결정 사항
  (구독 전용, 비대칭 메시징, 스토리 만료, 모더레이션, 미성년자 정책 등)을 반영한
  초안. 화면 상단에 "초안, 출시 전 변호사 검토 필요" 배너 고정 표시. Profile 탭에서
  링크 연결.

**아직 안 한 것**: 실제 소셜 로그인 UI(`login.tsx`는 여전히 dev-login만) 자체가
없어서, `agreedToTerms` 체크박스가 실제 화면에 붙어있지 않음 — 소셜 로그인 UI를
만들 때 이 두 화면 링크를 체크박스와 함께 넣어야 함. 동의 시각/버전을 기록하는
필드도 없음(지금은 API 파라미터로만 검증하고 저장은 안 함).

## CP(페어링) 채팅방 — 스펙 확정, 구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "CP(페어링) 채팅방" 절 참고. 여기는
그걸 구현할 때의 기술적 방향.

- **스키마**: 기존 `Actor`/`Message`/`Subscription`/`Story` 테이블은 건드리지 않는다.
  `GlCp`(지금은 할인 계산용 페어링 메타데이터일 뿐)를 실제 채팅방으로 확장 —
  구체적으로는 `GlCp`에 딸린 신규 모델 두 개를 추가한다:
  - `CpSubscription` — `Subscription`과 같은 패턴(`userId`, `glCpId`,
    `startedAt`/`cancelledAt`, `iapPlatform`/`iapTransactionId`/`iapExpiresAt`).
    `@@unique([userId, glCpId])`.
  - `CpMessage` — `Message`와 같은 패턴이되 `actorId` 대신 `glCpId` +
    `senderActorId`(`GlCp.actorOneId`/`actorTwoId` 중 하나, 어느 배우가 보냈는지
    표시용) + `fanUserId`(nullable, 배우 발송이면 null, 팬 답장이면 그 팬).
    `mediaType`/`body`/`mediaUrl`/`createdAt`은 `Message`와 동일.
  - `{{name}}` 치환은 기존 브로드캐스트 조회 로직을 그대로 재사용(조회 시점에 요청한
    팬의 `displayName`으로 치환).
- **금칙어 필터**: `ModerationService.assertNoBannedWords()`를 CP방 답장 저장 전에도
  그대로 호출(로직 재사용, 신규 언어/목록 불필요).
- **IAP 상품**: 배우 개별 구독 SKU(`toffee_sub_{actorId}`) 패턴을 따라 CP방용
  `toffee_cp_{glCpId}`, 번들용 `toffee_bundle_{glCpId}` 3~4개 SKU를 스토어에 별도
  등록. 번들 구매 검증 시 서버가 `Subscription`(actorOne) + `Subscription`(actorTwo)
  + `CpSubscription`(glCp) 세 레코드를 한 트랜잭션으로 생성.
- **권한**: `ensureCanViewActor`처럼 CP방 전용 `ensureCanViewCpRoom(prisma, userId,
  glCpId)` 헬퍼가 필요 — 스태프는 자기 배우가 `actorOneId`/`actorTwoId` 중 하나로
  걸린 `GlCp`만 조회 가능(상대 배우 소속사에는 노출 안 함). 배우 본인은
  `ensureIsActorSelf`를 `actorOneId`/`actorTwoId` 양쪽에 대해 OR로 체크하는 식으로
  확장.
- **미정 — 구현 시 정할 것**: 팬 신고(`Report`) 기능을 `CpMessage`에도 붙일지, 붙인다면
  `Report.messageId`(현재 `Message`만 참조)를 어떻게 확장할지(nullable +
  `cpMessageId` 컬럼 추가하는 폴리모픽 방식이 가장 단순해 보임 — 확정 아님). 이번
  스펙 논의에는 포함 안 됨.
- 이번 범위에서 CP방 전용 스토리(24시간 소멸 콘텐츠)는 만들지 않음 — 배우 개인
  스토리 기능만 유지.

**아직 시작 안 함**: 위 스펙은 확정됐지만 마이그레이션/서비스/컨트롤러/앱 화면 전부
미착수. 사용자 확인 후 다음 세션(또는 이어지는 작업)에서 구현.

## 아티스트 게시글(영구 게시판) — 스펙 확정, 구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "아티스트 게시글" 절 참고.

- **스키마(안)**: `Story`와 비슷하지만 `expiresAt`이 없는 `ActorPost`(actorId,
  mediaType, body, mediaUrl, createdAt) + `PostComment`(postId, fanUserId,
  parentCommentId nullable, body, createdAt). `parentCommentId`가 가리키는 댓글이
  또 `parentCommentId`를 갖지 않도록(대댓글 1단계 제한) **서비스 레이어에서 검증**
  (부모 댓글의 `parentCommentId`가 이미 not-null이면 400) — DB 제약으로 강제하지
  않음(Prisma self-relation depth 제약은 표현이 번거로움).
- **신고 폴리모피즘 — CP방과 같은 미정 사항**: 지금 `Report.messageId`는 `Message`만
  가리킨다. CP방 스펙(`CpMessage`)에 이어 이번 게시판(`PostComment`)까지 생기면서
  "신고 가능한 대상"이 3종류(`Message`/`CpMessage`/`PostComment`)로 늘어난다. 구현
  시점에 한 번에 정리할 것 — 유력한 방향은 `Report`를 `messageId`/`cpMessageId`/
  `postCommentId` 전부 nullable로 두고 정확히 하나만 채우는 폴리모픽 구조. 확정
  아님, CP방 절의 미정 사항과 같이 묶어서 다음 구현 세션에서 결정.
- **댓글 필터**: 저장 전 `ModerationService.assertNoBannedWords()` 재사용(기존 로직
  그대로).
- **삭제 권한**: `PostComment` 삭제는 `ensureIsActorSelf(postId의 actorId)`를 통과한
  배우 본인 또는 ADMIN만 가능 — 신고(`Report`) 큐를 거치지 않는 별도 엔드포인트로 둔다
  (예: `DELETE actors/:actorId/posts/:postId/comments/:commentId`).
- **소속사 모니터링**: 기존 `GET actors/:actorId/messages/broadcasts` +
  `GET actors/:actorId/stories`를 합쳐 보여주는 앱의 "모니터링" 탭에 게시글도 같은
  방식으로 추가(신규 권한 로직 불필요, `ensureCanViewActor` 재사용).
- 프로필 화면(앱)에 구독자 전용 게시판 섹션 추가 필요 — `actor/[id].tsx`에 구독자
  여부에 따라 조건부 렌더링.

**아직 시작 안 함**: 마이그레이션/서비스/컨트롤러/앱 화면 전부 미착수.

## 대화기록 보존 기간 — 스펙 확정, 구현 전 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "대화기록 보존 기간" 절 참고.

- **삭제 대상**: `senderType === FAN`인 `Message`/`CpMessage` 행, 그리고
  `PostComment` 행. `senderType === ARTIST`인 브로드캐스트와 `ActorPost`는
  삭제 대상에서 제외.
- **삭제 조건**: 해당 팬의 `Subscription`(또는 `CpSubscription`)의
  `cancelledAt`이 `not null`이고 `now() - cancelledAt > 1년`인 경우. `Subscription`은
  `@@unique([userId, actorId])`라 재구독 시 기존 행의 `cancelledAt`을 다시 `null`로
  되돌리는 구조 — `subscriptions.service.ts`의 `subscribe()` 로직으로 **확인 완료**
  (재구독 시 새 행을 만들지 않고 기존 행을 `update`하면서 `cancelledAt: null`로
  리셋함, 2026-09-21 코드 확인). 따라서 **재구독하면 조건에 안 걸려서 자동으로
  보존됨** — 별도 "복구" 로직 불필요.
- **PostComment 기준**: 댓글 작성자(`fanUserId`)의 **해당 게시물 작성자(배우)에 대한
  구독**이 위 조건을 만족하면 삭제. CP방 댓글 개념은 없음(게시글은 배우 개인 프로필
  기능이라 CP방과는 무관).
- **cron**: `StoryCleanupService`(매시간 `EVERY_HOUR`)와 별개로 신규
  `RetentionCleanupService`를 만들어 하루 1번(`CronExpression.EVERY_DAY_AT_MIDNIGHT`
  등, 시간대는 태국/한국 새벽 트래픽이 적은 시간대로 결정 필요) 실행 — 삭제 대상이
  많아질 수 있어 스토리 정리보다 빈도를 낮게 잡음.
- **미디어 파일**: 텍스트 행과 동시에 삭제하되, 스토리 정리 때와 마찬가지로 **실제
  파일 스토리지 연동 전까지는 DB 행만 지우고 `mediaUrl`이 가리키는 파일 자체는 못
  지운다** — 스토리지 프로바이더 연동 후 같이 처리할 것(기존 스토리 정리 미해결
  항목과 동일 선상).
- **이용약관 반영 필요**: `app/src/app/terms.tsx` 초안에 이 보존 기간(1년) 조항이
  아직 없음 — 다음에 법률 문구 다듬을 때 같이 추가.

**아직 시작 안 함**: 마이그레이션(불필요, 신규 컬럼 없음)은 없지만 서비스/cron
자체가 미착수.

## 메시지 번역 — LLM 기반으로 방향 전환, 구체적 서비스는 미정 (2026-09-21)

제품 결정은 `docs/product/feature-decisions.md`의 "출시 국가·다국어 범위" 절 참고.
출시 언어는 태국어(`th`)/한국어(`ko`)/영어(`en`)/일본어(`ja`)/중국어(`zh`, 해외
화교권 대상 — 중국 본토 서비스는 범위 밖) 5개로 확정(2026-09-21, 3개 → 5개로 확장).

**번역 엔진 방향이 Google Cloud Translation(전통적 기계번역)에서 LLM 기반으로
바뀜(2026-09-21, 같은 날)** — 이유는 제품 문서 참고(태국어 등 저자원 언어의
대화체 번역 품질 문제, 캐싱 구조 덕분에 파일럿 규모에서 LLM 비용이 절대금액으로
미미함). **어느 LLM(Claude/GPT/Gemini)을 쓸지는 아직 미정** — 실제 팬-배우 DM
스타일 샘플 문장으로 비교 테스트한 뒤 결정하기로 함. 아래는 그 전에 정리해둔
설계 방향(엔진이 확정되면 이 절을 갱신할 것):

- **연동 방식**: 엔진이 무엇이든 백엔드에는 `translate(text, targetLanguageCode)`
  하나만 노출하는 얇은 래퍼로 감쌀 것 — 나중에 엔진을 교체해도 호출부(메시지/
  CP방/게시글 번역 요청 로직)를 안 건드리게. Claude API를 쓰게 되면 공식
  Anthropic SDK(`@anthropic-ai/sdk`)를 쓸 것(REST 직접 호출 금지 — SDK가 있는데
  fetch로 우회하지 않는다는 이 저장소 컨벤션과 별개로, Claude API 자체가 SDK 사용을
  기본으로 요구함). Google Cloud Translation으로 갈 경우에만 기존 계획대로 REST
  직접 호출(`EmailService`처럼) 검토.
- **신규 서비스**: `backend/src/translation/translation.service.ts` (가칭) —
  `translate(text, targetLanguageCode)` 하나만 노출. IAP/이메일과 마찬가지로 API
  키/서비스 계정 미설정 시 **조용히 무시하지 않고 에러** — 번역은 안전 게이트는
  아니지만, 미설정 상태로 조용히 원문만 내려주면 "번역 버튼을 눌렀는데 그대로"인
  버그처럼 보이므로 명시적 에러가 더 안전.
- **프롬프트(LLM으로 확정될 경우)**: 팬서비스 대화체 톤 유지 지시를 시스템
  프롬프트에 넣을 것 — 딱딱한 직역이 아니라 원문의 다정한 어조를 살리는 게 이번
  엔진 전환의 핵심 이유이므로, 프롬프트 설계 없이 그냥 "번역해줘"만 넣으면 전환한
  의미가 없음.
- **캐싱 흐름 변경 없음**: 기존 `MessageTranslation`(`messageId`+`languageCode` unique)
  스키마 그대로 사용 — 팬이 번역을 요청하면 캐시 조회 → 없으면 `translate()` 호출 후
  upsert. 자동 전체 번역은 하지 않음(비용 절감, 기존 설계 의도 유지).
- **CP방/게시글에도 번역 필요**: `CpMessage`/`ActorPost`/`PostComment`에도 같은 번역
  캐싱이 필요해짐 — `MessageTranslation`처럼 각각 전용 캐시 테이블을 또 만들지,
  아니면 하나의 폴리모픽 번역 캐시 테이블로 통합할지는 미정(CP방/게시글 스펙에서
  이미 남겨둔 `Report` 폴리모피즘 이슈와 같이, 구현 시점에 한 번에 정리할 것).
- **환경변수**: 엔진 확정 후 정할 것 — Claude API면 `ANTHROPIC_API_KEY`, Google Cloud
  Translation이면 `GOOGLE_TRANSLATE_API_KEY`(또는 서비스 계정 JSON) 식. 아직 미추가.

**아직 시작 안 함**: 번역 엔진 자체가 미확정이라 서비스/컨트롤러/환경변수 전부
착수 전. 엔진 비교 테스트(실제 팬-배우 DM 스타일 샘플 문장으로 Claude/GPT/Gemini
번역 품질 비교)부터 먼저 해야 함. 앱 쪽 "번역 보기" 버튼 UI도 아직 없음(현재 채팅
화면에 번역 트리거 자체가 없음 — 확인 필요).

## 데이터 백업/보안 정책 + 보안 하드닝 체크리스트 (2026-09-21, 구현 전)

17개 질문 중 개발 관련 1번(백업/보안)·6번(보안 하드닝)에 대한 답. 대화기록
**보존 기간**(1년) 정책은 별도로 위 "대화기록 보존 기간" 절에 이미 정리돼 있고,
여기는 그것과 별개인 백업/보안 전반.

### 백업

- **DB 백업**: 아직 구현 안 함(CI/CD 미착수와 같은 맥락). 관리형 Postgres(Supabase/
  Neon/Railway 등, 호스팅 미정)를 쓰면 대부분 일 단위 자동 백업을 기본 제공하니,
  호스팅을 정할 때 "자동 백업 포함 여부"를 선택 기준에 넣을 것.
- **권장 보존 기간**: 일 단위 백업 30일 + 주 단위 백업 90일 정도가 이 규모 서비스의
  일반적 기준 — 확정 아니고 호스팅 정할 때 같이 정할 것.
- **복구 훈련**: 최소 분기 1회, 백업에서 실제로 복구가 되는지 테스트 환경에 복원해보는
  절차를 만들 것(지금은 계획만 있고 실행 이력 없음).

### 보안 하드닝 체크리스트

- [x] `ValidationPipe`(`whitelist`/`forbidNonWhitelisted`/`transform`) — 이미 적용됨
  (`backend/src/main.ts`).
- [x] ID 필드는 `@IsUUID()` 대신 `@IsString()+@IsNotEmpty()` — 이미 컨벤션으로 적용 중.
- [x] JWT는 매 요청마다 DB에서 유저 상태 재조회(정지/차단 즉시 반영) — 이미 구현됨.
- [x] **로그인/인증 엔드포인트 rate limiting** — (2026-09-28 재정정) 전역 `ThrottlerGuard`
  (IP당 분당 60회)에 더해, 소셜 로그인 5개 엔드포인트엔 이미 `@Throttle(LOGIN_THROTTLE)`(분당
  5회)가 걸려 있었음(`auth.controller.ts`). 같은 날 앞서 "로그인 전용 제한은 없음"이라고 적은
  것도 틀렸던 것 — 확인 없이 체크리스트 문구만 보고 적었음.
- [x] **의존성 취약점 스캔** — `.github/dependabot.yml`(backend/app npm 주 1회,
  Actions 월 1회, Expo SDK 묶인 패키지 메이저는 제외) (2026-09-28). GitHub 저장소 설정에서
  "Dependabot alerts/security updates"가 켜져 있는지는 사용자가 확인 필요.
- [ ] **관리자(ADMIN) 계정 추가 보호** — 지금은 일반 로그인과 동일한 인증 수준.
  민감한 권한(회원 정지/차단, 금칙어 관리)을 고려하면 2단계 인증(TOTP 등) 도입을
  검토할 것.
- [x] **업로드 파일 검증** — 선언 형식·용량 검사 + 첨부 시 실제 파일 내용(매직 넘버) 검사,
  배우·용도별 경로 강제(2026-09-28, "파일 업로드" 절).
- [ ] **CORS 허용 목록** — 지금 개발 단계 설정이 프로덕션 기준으로 좁혀졌는지 재점검
  필요.
- [x] **민감정보 로깅 방지 (Sentry 쪽)** — `dataCollection` 제한 + `scrubEvent`
  (2026-09-28). 단 Nest 기본 로거가 콘솔에 찍는 에러 스택(Prisma 에러 메시지 등)은 호스팅
  로그에 그대로 남음 — 호스팅 정할 때 로그 보존 기간/접근 권한 같이 정할 것.
- [x] **Sentry(에러 모니터링)** — 백엔드+앱 연동 완료(2026-09-28), DSN만 넣으면 동작.

### 개인정보/규제 메모

- 태국 팬 개인정보는 태국 PDPA, 글로벌 팬까지 고려하면 GDPR 유사 조항도 검토
  대상(이미 `business-compliance-checklist.md` 2번 항목에 있음).
- 데이터 유출 시 통지 기한(PDPA/PIPA 공통으로 대략 72시간 내 통지 개념이 있음)에
  맞는 대응 절차(runbook)를 문서화해둘 것 — 지금은 없음.

## 알려진 인프라 이슈

- ~~`backend`의 `npm ci`가 `@nestjs/config@^4.0.4`(peer: `@nestjs/common@^10||^11`)와
  루트 `@nestjs/common@^12.0.1` 버전 충돌로 실패함 — `--legacy-peer-deps`로 우회 설치
  중.~~ **해결 (2026-09-28)**: `@nestjs/config` 4→12, `@nestjs/jwt` 11→12,
  `@nestjs/passport` 11→12, `@nestjs/throttler` 6.5→6.7(전부 Nest 12 peer 지원 버전)로
  올리고 lockfile을 `--legacy-peer-deps` 없이 다시 생성 — 이제 그냥 `npm ci`로 설치됨
  (CI도 이걸로 돎). 업그레이드 후 로그인(JWT 발급/검증), 401 가드, 스로틀링 실서버 확인.

## 서버 오류 문구 다국어 (2026-09-28)

- 예외는 `throw new XxxException(appError('CODE', params?))`(`common/i18n/app-error.ts`)로 던진다. 문구는
  `common/i18n/error-messages.ts`의 `ERROR_MESSAGES`에 코드별 6개 언어(`satisfies Record<SupportedLocale, …>`라
  하나라도 빠지면 타입 오류). 예외 객체의 `message`는 한국어(로그·단위 테스트용).
- `LocalizedExceptionFilter`(`common/filters/`, `SentryGlobalFilter` 확장, APP_FILTER로 등록)가 응답을
  `{ statusCode, code, message, details? }`로 통일하고 `Accept-Language`로 번역. 앱 `apiClient`가 `i18n.language`를
  이 헤더로 보냄(`ApiError.code`로 받음 — 분기는 문구가 아니라 코드로).
  - 코드 없는 HttpException(프레임워크 기본: 401, 404 라우트 없음, 429 스로틀 등)은 상태 코드별 기본 문구, 원문은
    4xx면 `details`에.
  - ValidationPipe(메시지 배열)는 `VALIDATION_FAILED` + `details`에 원문.
  - 처리 안 된 예외는 필터가 직접 Sentry `captureException` + 로그 후 `INTERNAL`(원문은 응답에 안 넣음) — 500을
    HttpException으로 바꿔 부모 필터에 넘기면 SDK가 "예상된 오류"로 보고 건너뛰기 때문.
- 날짜 파라미터(정지 해제 시각, 닉네임 변경 가능일)는 ISO로 넘기고 번역 때 받는 사람 언어·태국 시간으로 포맷.
- 파일 업로드 "다른 용도로 올린 파일" 문구 3종은 `UPLOAD_WRONG_PLACE` 하나로(`MediaService.verifyAt` 인자 제거).
- 예외: 부모 동의 링크 페이지(`GET /parental-consent/confirm`)는 브라우저 HTML이라 이 필터와 무관하고 아직 한국어만.

## 인용 답장 알림 (2026-09-28)

- `sendBroadcast`: 인용 요약(`toQuote`)이 가려지지 않았고 인용된 팬이 알림 대상 구독자(해지 X, `notificationsMuted`
  X)면, 일반 발송 목록에서 빼고 `sendToUser`로 `quotedReplyTitle` 알림 한 건(data `type: 'QUOTED_REPLY'`).
- 앱: 알림 열기 시 팬은 `/chat/[actorId]?focus=<messageId>` — 채팅방이 그 메시지로 `scrollToIndex` 후 2.5초 테두리
  강조. 사진 로딩 등으로 목록 높이가 바뀌며 맨 아래로 내려가는 걸 막으려고 1.5초 동안은 focus에 고정.

## 스타 화면 팬 답장 줄 + 답장 채팅 화면 (2026-09-28)

- `GET /actors/:id/messages/broadcasts`(스튜디오·소속사 모니터링 공용): 삭제 안 된 최근 스타 메시지 10개
  (`REPLY_PREVIEW_MESSAGES`)에만 `recentReplies`(`{ id, nickname, body(80자), createdAt }[]`, 오래된 것 → 최신, 최대
  20개 `REPLY_PREVIEW_PER_MESSAGE`). 답장이 없으면 `[]`(앱이 "기다리는 중" 줄), 그 밖의 메시지는 필드 없음(숫자만).
- 조회는 답장이 있는 메시지마다 `findMany({ where: { replyToMessageId }, take })`를 병렬로 — `include`의 중첩 `take`는
  Prisma 기본 전략(query)에서 전체 답장을 읽은 뒤 메모리에서 자를 수 있어서. `@@index([replyToMessageId])` 사용.
  필터: 차단(`notBlockedIn`) + `fanUser.status ACTIVE`·`deletedAt null` + `reports none RESOLVED` + `deletedAt null`.
  `replyCount`는 기존대로 차단만 뺀 숫자라 미리보기 개수와 다를 수 있음(의도).
- `GET .../messages/replies?messageId&limit&before`: `limit`(1~200)·`before`(답장 id) 주면 Prisma cursor 페이지네이션,
  `orderBy [createdAt desc, id desc]`(같은 시각에도 순서 고정). 안 주면 전부(콘솔 기존 동작).
- 앱 `components/reply-ticker.tsx`: 보여주는 답장을 **id로** 기억하고 2.5초마다 다음 id로(끝이면 처음) — 새 답장이
  붙어도 건너뛰지 않음. `Animated` 슬라이드(웹은 JS 드라이버), reduce motion이면 애니메이션 없이.
- 앱 `studio/[actorId]/replies/[messageId].tsx`: `useInfiniteQuery`(100개씩, 3초 폴링 — 불러온 페이지 전부 다시 받음,
  id로 중복 제거) + `inverted` FlatList(첫 항목 = 최신 = 맨 아래). `maintainVisibleContentPosition
  { minIndexForVisible: 0, autoscrollToTopThreshold: 80 }`로 맨 아래면 따라가고 위면 자리 유지, 스크롤 위치로
  "새 답장 N개 ↓"(위로 올린 순간의 최신 id 이후 개수). `FanReplyActions`에 `onQuote`(스타 화면에서만 ⋯에 답장하기).
- 확인: 로컬 Postgres + 시드 + 웹(Playwright)으로 답장 줄 순서, 채팅 화면 방향, 새 답장 버튼, 맨 아래 따라가기,
  ⋯ 메뉴까지 실제 화면으로 확인. 인라인 확인 중 답장 화면 상단 스타 메시지에 `{{name}}`이 그대로 보이던 것도 수정
  (`showNameToken`).

## 부모 동의 메일·페이지 다국어, 두 단계 동의 (2026-09-28)

- `parental-consent/consent-texts.ts`: 6개 언어 문구 + 메일 HTML(`consentEmail`) + 페이지 HTML(`consentPage`). 메일은 자녀
  언어(`childLocale`: User.locale → countryCode → en) + 영어.
- `GET /parental-consent/confirm?token&lang`: 상태만 보여줌(`consentPageState`: ask/done/invalid) — 동의 처리 X. 언어는
  `lang` → `matchAcceptLanguage`(지원 언어 아니면 null) → 자녀 언어 → en. `Cache-Control: no-store`, `Referrer-Policy:
  no-referrer`(URL에 토큰).
- `POST /parental-consent/confirm`(form: token, lang): 실제 동의. 이미 동의했으면 시각을 덮어쓰지 않음.
- 이유: 예전엔 GET 자체가 동의 처리라 Gmail/Outlook 링크 보안 검사(미리 열기)만으로 부모가 누르지 않아도 동의될 수 있었음.

## 2026-09-28 점검 후 서버 보안 수정

- `SandboxSubscribeGuard`: 결제 없는 `POST /actors/:id/subscribe`는 `ENABLE_SANDBOX_SUBSCRIBE=true`일 때만(기본 404).
  예전엔 항상 열려 있어 운영에서도 API로 무료 구독 가능했음.
- 소셜 로그인 계정 합치기: `ExternalIdentity.emailVerified`(구글 `email_verified`, 애플 `email_verified`, 카카오
  `is_email_valid && is_email_verified`, 네이버·라인은 보증 없음 → false). 확인된 이메일만 기존 계정 합치기·`User.email` 저장.
- `ensureCanSubscribe`: 약관 버전·생년월일 필수(`ONBOARDING_REQUIRED`) + 부모 동의 대기 차단 — 앱 온보딩을 API로 우회 못 하게.
- `PushService.sendToUsers`: 탈퇴·영구차단·정지(기간 중) 계정 기기 제외.
- 신고 승인(RESOLVED)된 팬 답장은 `listReplies`·`replyCount`에서 제외(스타·소속사 화면에서 가림).
- 네이버·카카오 토큰 오류도 `SOCIAL_TOKEN_INVALID`(번역)로.

## 디자인 시스템 (2026-09-28)

- 토큰(`constants/theme.ts`): 공식 5색 + `textTertiary`·`border`(중립)·`primary`/`onPrimary`(Charcoal CTA), `Radius`.
  글꼴은 굵기별 파일(400/500/600/700)로(`fontFor(weight, language)`) — 안드로이드는 커스텀 글꼴에 fontWeight가 안 먹어서.
  2026-09-29부터: 네이티브는 앱 언어로 한 가족을 고름 — `th` → Noto Sans Thai(`ThaiFontFamily`), `ja`/`zh-*` → 시스템 글꼴 +
  fontWeight, 그 외(ko·en) → Pretendard(`FontFamily`, `app/assets/fonts/Pretendard-*.otf`, 라이선스 `Pretendard-LICENSE.txt`).
  웹은 `Pretendard_X, NotoSansThai_X, 시스템` 글꼴 목록으로 글자마다 섞음. 로드는 `_layout.tsx`의 `useFonts`. `ThemedText` 타입: display 28 · title 22 ·
  subtitle 19 · headline 17 · default 15 · small 13 · caption 12(+Medium/SemiBold 변형).
- 공통 부품 `components/ui/`: Icon(Lucide), Button(primary/accent/secondary/ghost/danger), IconButton, Avatar(ring/dot),
  SearchField, Chip, CountBadge, SectionHeader, ListRow, BrandHeader(워드마크), EmptyState, TextField, Checkbox. 가입 절차 틀
  `OnboardingLayout`, 앱 사용 중 알림 `InAppBanner`(푸시 훅 → `showInAppBanner`). 로고 이미지는 `assets/brand/`.
- 스택 헤더 공통 스타일은 `_layout.tsx` screenOptions. 네이티브는 AppState → react-query `focusManager`(백그라운드 폴링 중지,
  복귀 시 새로고침).
- 서버: `GET /actors?sort=trending|new`(구독 수·등록순, 활동 종료 배우 제외), `GET /me/subscriptions`에 `unreadCount`·`lastMessage`
  + 최근 대화 순(`Subscription.lastReadAt` — 팬 채팅방 조회 때 갱신), `GET /actors/:id/messages?limit&before`(나눠 받기).
- 업로드: `uploadMedia(..., { onProgress, signal })` — 저장소 PUT을 XMLHttpRequest로(진행률), AbortSignal로 취소.

## 제재 사유·작업 기록·배우 활동 종료 (2026-09-28)

- 스키마: `User.sanctionCategory`(ReportCategory)·`sanctionNote`, `Actor.retiredAt`, `AdminAction`(adminId·action·targetType·
  targetId·detail Json). 마이그레이션 `20260928180000_add_sanction_reason_actor_retire_admin_actions`(로컬 DB에서 생성·적용,
  드리프트 0).
- `AuditService`(@Global `AuditModule`): `record()`는 AdminUsersService(정지·차단·해제·역할), ReportsService(승인·기각),
  AdminActorsService(활동 종료·재개)에서. `GET /admin/actions` 최근 100건(대상 이름 포함).
- 정지·차단 API는 `category` 필수(`SanctionReasonDto`/`SuspendUserDto`). JwtStrategy가 `ACCOUNT_SUSPENDED`/`ACCOUNT_BANNED`에
  `reason` 파라미터 → 번역 문구에 사유 분류.
- `PATCH /admin/actors/:id/retire { retired }`. 활동 종료 배우: `/actors` 목록 제외, 구독·결제 검증은 `ACTOR_RETIRED`, 프로필은
  `retiredAt`을 내려줘 앱이 안내.

## 실시간 신호, 요청 제한 계정 단위, 앱 설정 분리 (2026-09-29)

- **실시간(`backend/src/realtime/`)**: `GET /realtime`(SSE, 전역 JWT 가드 그대로 — 앱이 `Authorization` 헤더로 연결).
  이벤트는 내용 없이 `{kind, actorId, messageId?}`만 — `artist-message`(sendBroadcast), `message-removed`(deleteBroadcast,
  신고 승인), `fan-reply`(sendReply). `RealtimeService.publish`가 `pg_notify('toffee_realtime', json)`, 서버마다 `pg.Client`
  하나로 `LISTEN`(끊기면 1초→30초 백오프 재연결) → rxjs Subject. 연결별 수신 대상은 연결 때 + 60초마다 DB에서 다시 읽음
  (`canReceive`: 운영자 전부, 스타·소속사는 볼 수 있는 배우의 모든 신호, 팬은 구독 중인 배우의 스타 메시지·삭제만 — 팬 답장
  신호는 팬에게 안 감). 25초마다 ping, `X-Accel-Buffering: no`, `@SkipThrottle`.
- **앱(`app/src/lib/realtime.ts`)**: `expo/fetch`로 스트림을 읽어(RN엔 EventSource가 없고 헤더도 못 붙여서) SSE를 직접 파싱,
  신호별로 react-query `invalidateQueries`(`messages`·`reply-quota`·`my-subscriptions`·`actor-broadcasts`·`actor-replies`).
  `SessionEffects`에서 로그인 동안 유지, 백그라운드면 끊고 복귀 시 재연결, 구독 목록이 바뀌면 재연결(서버 수신 대상 갱신).
  `useLiveInterval(ms)` — 연결 중이면 폴링 30초(놓친 신호 대비), 끊기면 원래 간격(5초/3초/10초).
  웹 확인: 스타 발송 → 팬 채팅 174ms, 팬 답장 → 스타 답장 화면 97ms, 이벤트 후 추가 요청 1회.
- **요청 제한(`common/guards/user-throttler.guard.ts`)**: `ThrottlerGuard.getTracker`를 JWT 서명이 맞으면 `user:<id>`, 아니면
  IP로. 이유: 모바일 망 CGNAT·호스팅 프록시 뒤에선 여러 팬이 한 IP. 로그인 요청은 여전히 IP 단위라 호스팅 때 프록시 뒤면
  Express `trust proxy` 설정 필요(ops-infra-backlog).
- **앱 설정(`app/app.config.ts`, `eas.json`)**: 젤리 방식 — `APP_VARIANT=production`(eas production 프로필만)일 때만 운영 번들 ID
  `com.toffeechat.app`(잠정), 그 외 `.dev` + 이름 "Toffee Dev" + 스킴 `toffee-dev`. Firebase 설정 파일도 변형별
  (`GoogleService-Info(.dev).plist`, `google-services(.dev).json`, 아직 없음). iOS 권한 문구는 `infoPlist` 기본(영어) +
  `locales/*.json` 6개 언어. 아이콘·스플래시는 `docs/product/brand/logo/t-icon-black-mono-a.png`에서 생성(흰 배경 제거,
  아이콘 배경 `#F3EFFD`), Expo 템플릿의 파란 스플래시 애니메이션(`animated-icon`)은 `splash-overlay`(네이티브 스플래시와
  같은 화면 → 250ms 페이드)로 교체.
  **EAS 연결(2026-10-01)**: `owner: 'toffeechat-team'`(Expo 조직 — 개인 계정 `toffeechat`이 아니라 조직 소유), `extra.eas.projectId`
  `994e5a33-…`. 운영·개발 변형이 같은 EAS 프로젝트(slug `toffee`)를 쓰고 빌드 프로필로만 나뉨. `expo-updates`는 아직 없음
  (OTA 쓸 때 `updates.url = https://u.expo.dev/<projectId>` 추가).

## 구매(Purchase)·묶음(Bundle)·방 이용권(Subscription), 성인만 가입 (2026-09-29)

- **두 층 구조**: `Purchase`(결제 단위 — `actorId` 개인 구독 xor `bundleId` 묶음, DB CHECK 제약 `Purchase_target_check`,
  `iap*` 필드는 Subscription에서 여기로 이동) → `Subscription`(사람×배우 방 이용권, 기존 그대로 `@@unique([userId, actorId])`,
  startedAt·lastReadAt·notificationsMuted 유지). `SubscriptionsService.syncAccess(tx, userId, actorIds, prices)`가 유효한 구매로부터
  방 열림/닫힘을 다시 계산: 새로 열리면 startedAt=now + STARTED 이벤트(가격은 배분값), 닫히면 CANCELLED, 이미 열린 방은 손대지 않음
  (개인 → 묶음 전환에도 대화 유지). 구독·해지·검증은 전부 interactive `$transaction` 안에서.
- 마이그레이션 `20260929100000_add_purchases_and_bundles`: 테이블 생성 → 기존 Subscription 한 줄당 개인 Purchase 하나로 백필
  (`gen_random_uuid()`, 가격은 당시 배우 월 가격) → Subscription의 iap 컬럼 삭제. 새 DB·기존 DB 둘 다 드리프트 0 확인.
- 엔드포인트: `POST /bundles/:id/subscribe`(샌드박스 가드), `GET /me/bundles`, `DELETE /me/purchases/:id`, `GET /actors/:id/bundles`,
  `GET /bundles/:id`, `/admin/bundles` CRUD(`BundlesModule`). `DELETE /actors/:id/subscribe`는 개인 구독만 해지하고, 묶음으로만 열린
  방이면 409 `COVERED_BY_BUNDLE`. `GET /me/subscriptions` 각 방에 `coveredBy[{purchaseId, bundle}]`.
- 묶음 가격 배분 `allocateBundlePrice`(정가 비율, 반올림 차이는 마지막 배우). 한계: 개인 구독 중이던 배우를 묶음으로 옮길 땐 그 방이
  이미 열려 있어서 STARTED 이벤트가 새로 안 생김 → 이벤트 기반 "신규 구독 금액" 통계엔 묶음 배분이 일부 빠짐. 정산은 이벤트가
  아니라 Purchase 기준으로 만들 것.
- 스토어 상품 ID: `Actor.storeProductId`·`Bundle.storeProductId`(둘 다 unique, 배우·묶음 통틀어 하나 — `ensureStoreProductIdFree`),
  형식 `^[a-z0-9][a-z0-9_.]{0,99}$`(애플·구글 공통). 예전 `toffee_sub_{uuid}`는 하이픈 때문에 등록 불가였음. 앱 `usePurchaseSubscription(actorId, storeProductId)`.
- `verifyPurchase`: 같은 영수증(iapTransactionId)이 다른 계정이면 409 `IAP_RECEIPT_IN_USE`(예전엔 unique 위반 500), 같은 계정이면
  만료일 갱신. 묶음 결제 검증·상품↔배우 대조·만료 거절·스토어 알림은 결제 연결 때.
- **성인만 가입**: `ParentalConsentStatus.UNDERAGE`(마이그레이션 `20260929090000`), `ADULTS_ONLY`(기본 켜짐, "false"면 예전 부모 동의),
  `adultAgeFor(country)`(minor-age.ts). `GET /me/onboarding-status`에 `minimumAge`. 구독은 `UNDERAGE`면 403. 앱 `onboarding/underage`.
- 운영자 작업 기록: `ACTOR_PRICE`(배우 가격·상품 ID 변경), `BUNDLE_CREATE`/`BUNDLE_UPDATE`, targetType `BUNDLE`.

## 미디어 보기·모아보기·복사·음성 이어 듣기·끊김 표시 (2026-09-29)

- 서버: `GET /actors/:actorId/messages/media?limit&before`(팬, 구독 시작 이후·안 지워진 스타 PHOTO/VIDEO, mediaKey 또는 예전
  mediaUrl, `{ items, total }`). `Message.thumbhash`(마이그레이션 `20260929110000`) — 스튜디오가 올릴 때 `Image.generateThumbhashAsync`로
  사진(영상은 첫 장면) 값을 계산해 broadcast에 실어 보냄(웹은 계산 불가라 없음). 실시간 신호 `artist-message`/`message-removed`가
  `['chat-media', actorId]`도 무효화.
- 앱: 루트에 `GestureHandlerRootView`. `components/zoomable-page.tsx`(RNGH Pinch/Pan/Tap(2) + Reanimated, 확대 중엔 사방 이동·
  바깥 가로 목록 스크롤 끔, 확대 안 됨이면 세로 끌기만 `activeOffsetY/failOffsetX`로 가로 넘기기에 양보, 120px·900px/s 넘으면 닫기,
  배경 투명도 `dismissProgress`(prop 공유값은 React Compiler 규칙 때문에 `.set()`)). `media-viewer.tsx`는 `actorId`가 있으면
  `useChatMedia`를 가로 `inverted` FlatList로(최신이 오른쪽, 왼쪽 끝에서 이전 페이지), 누른 id가 없으면 최대 20페이지까지 더
  불러와 찾음, 없으면 단일 모드. 영상은 현재 페이지만 플레이어 생성. 웹은 `<img>` 기본 드래그가 끌어서 닫기를 가로채서 이미지를
  `pointerEvents="none"` View로 감쌈. `media-gallery/[actorId].tsx` 3열 격자. `MediaTile`은 expo-image + thumbhash placeholder.
- 복사: `expo-clipboard`(SDK 57 호환 버전을 npm으로 — `expo install`은 이 환경에서 expo API 차단). 끊김: `expo-network`
  `useNetworkState`, `components/offline-banner.tsx`(pointerEvents none).
- 음성: `voice-message.tsx`에 id→재생 함수 레지스트리, 끝나면 `nextId`(채팅방이 계산한 다음 최신 음성) 재생. `lib/audio-mode.ts`
  `PLAYBACK_AUDIO_MODE`(playsInSilentMode·shouldPlayInBackground·doNotMix)를 앱 시작과 스튜디오 녹음 종료 때 적용, expo-audio
  플러그인 `enableBackgroundPlayback: true`. 실기기에서 확인 필요(웹은 해당 없음).

## 출시 준비: Docker·설정 점검·공개 약관·부하 테스트 (2026-09-29)

- `backend/Dockerfile`(node:22-slim 2단계, openssl은 Prisma 마이그레이션 엔진용), `docker-entrypoint.sh`(`RUN_MIGRATIONS` 기본 true →
  `prisma migrate deploy` 후 `node --import ./dist/instrument.js dist/main`), `.dockerignore`. 이 세션에선 Debian 패키지 서버가 막혀
  full `node:22` 변형으로 빌드·실행 확인(새 DB에 마이그레이션 25개 적용, `/health/ready`·`/legal/*`·`/support` 200, SIGTERM 즉시 종료).
- `common/config/env-check.ts` — 필수(`DATABASE_URL`, `JWT_SECRET`), 운영(`NODE_ENV=production`)에서 JWT 32자 미만·`ENABLE_DEV_LOGIN`·
  `ENABLE_SANDBOX_SUBSCRIBE`·`API_PUBLIC_URL` 없음이면 `main.ts`가 로그 남기고 `exit(1)`. 외부 서비스 키 누락은 경고만.
  `main.ts`: `TRUST_PROXY`(숫자=홉 수), `enableShutdownHooks()`. `RealtimeService.onModuleDestroy`의 subject.complete → SSE 스트림 complete.
- `GET /health/ready`(`SELECT 1`, 실패 503). 헬스·약관·지원 페이지는 `@SkipThrottle`.
- `legal/` — 약관·개인정보처리방침 초안 원본(`legal-texts.ts`), `GET /legal/:doc`(HTML, `?lang`·Accept-Language로 초안 안내 언어),
  `GET /legal/:doc/sections`(앱 `LegalDocument`가 씀), `GET /support`(`SUPPORT_EMAIL`). 앱 `terms.tsx`/`privacy.tsx`는 서버 글을 받음.
- `backend/scripts/load-test.mjs` — 가짜 구독자 M명을 DB에 넣고 SSE N개를 연 뒤 스타 메시지 발송 시간·신호 도착 분포를 잼(끝나면 정리).
  로컬 결과(연결 3,000·구독자 10,000): 연결 3,000개 동시 열림 약 9초, 발송 API 0.2~0.3초, 신호 도착 p95 0.2초, 메모리 241→545MB.
  이 테스트로 찾아 고친 것: ① SSE `ready`를 방 목록 로드 전에 보내서 그 사이 신호가 버려질 수 있었음 → 로드 후 `ready`
  ② 연결마다 1분마다 방 목록 재조회(3,000개면 DB 부하 상시) → 구독이 바뀌면 `access-changed`(SubscriptionsService가 publish,
  그 사용자 연결만 재조회 + 앱이 인박스 새로고침), 안전 새로고침은 10분 + 흩뜨림 ③ 발송 API가 푸시 전송(FCM 500건씩)을 기다림 →
  기다리지 않음(void, 실패는 원래도 best-effort). 앱 `useRealtimeSync(token)`는 구독 변경 때 재연결하지 않음.

## 커플방 = Actor(kind COUPLE) (2026-09-29)

- 설계: 새 Channel 테이블 대신 **Actor 한 줄 = 방**으로 봄. `Actor.kind`(SOLO/COUPLE), `CoupleMember(coupleId, memberId)`(멤버 삭제는
  Restrict), `Message.senderActorId`(보낸 배우, 기존 스타 메시지는 actorId로 백필). 메시지·구독·구매·묶음·차단·신고·실시간·통계·
  미디어 경로(`actors/<방id>/...`)가 전부 actorId 기준이라 커플방도 같은 코드로 동작. `GlCp` 테이블 삭제. 마이그레이션 `20260929120000_couple_rooms`.
- 권한(`common/authorization/actor-access.ts`): `ensureIsActorSelf`가 커플방이면 멤버 배우 중 selfUserId가 요청자인 배우 id를
  돌려줌(= senderActorId, 운영자면 null). `viewableActorsWhere`에 `{ kind: COUPLE, coupleMembers: { some: { member: <본인/소속사 조건> } } }`
  추가 → 콘솔·실시간 수신 대상·차단·신고 확인이 자동으로 커플방 포함. `roomRetired`(방 또는 멤버 활동 종료)로 구독·묶음 구매 차단.
- 메시지: `withSenders`가 팬 목록·스튜디오 목록·발송 응답에 `sender {id, chatDisplayName, chatProfileImageUrl}`를 붙임. 커플방 푸시
  본문 앞에 "보낸 배우: ". `PushService.notifyActorStaff`는 커플방이면 멤버들의 소속사 직원 전원.
- 조회: `GET /actors?kind=COUPLE`(둘러보기 줄, 기본은 SOLO만), `GET /actors/:id/couples`, 응답에 `kind`·`coupleMembers`. 멤버 중 활동
  종료가 있으면 목록에서 숨김. 스토리 작성은 커플방이면 400 `STORY_NOT_FOR_COUPLE`.
- 운영자: `POST /admin/couples`(멤버 2명·SOLO·같은 쌍 중복 불가, 작업 기록 `COUPLE_CREATE`), 커플방엔 소속사 지정·본인 계정 연결 불가
  (`NOT_FOR_COUPLE`). 공식 사진은 운영자, 대화방 사진·방 이름은 멤버 배우(기존 `chat-profile-image`·`nickname` API가 멤버 권한으로 동작).
- 앱: `Actor.kind/coupleMembers`, `CoupleCard`, 배우 프로필 커플방 절·커플방 멤버 줄, 둘러보기 커플방 줄, 채팅 말풍선 보낸 배우 이름
  (보낸 배우가 바뀌면 묶음 분리), 스튜디오 목록 개인방/커플방 라벨·메시지 보낸 배우, 콘솔 라벨, 운영자 `admin/actors/new-couple`.

## 채팅방 안 검색 (2026-09-29)

- API `GET /actors/:actorId/messages/search?q=&limit=&before=`(`SearchMessagesQueryDto`, q 2~50자) → `MessagesService.searchForFan`.
  범위는 `listForFan`과 같음(구독 시작 이후, `deletedAt: null`, 스타 메시지 OR 본인 답장). 본문은 `contains + mode insensitive`(ILIKE).
  **Prisma `contains`는 `%`·`_`를 이스케이프하지 않아서** "%%"가 전부와 맞았음 → `escapeLike()`로 이스케이프(단위 테스트). 팬 이름에 q가
  들어 있으면 `{{name}}`이 있는 스타 메시지도 같이 찾고, 응답 본문은 personalize 후. 결과는 가벼운 필드(id·senderType·body·mediaType·
  createdAt·sender)만.
- 인덱스: `Message`에 `(actorId, createdAt)`가 없었음(기존은 PK·replyToMessageId뿐) — 팬 대화 나눠 받기·검색·모아보기가 모두 이 조건이라
  `@@index([actorId, createdAt])` 추가(마이그레이션 `20260929130000_message_actor_created_index`). 부분 문자열 검색은 이 인덱스로 방 단위
  행만 훑음 — 방당 메시지가 수만 개가 되면 `pg_trgm` GIN 인덱스 검토.
- 앱: `useChatSearch`(infinite, 30개씩). 채팅 화면에 방 안 검색 바(350ms 디바운스, ▲/▼, 결과 끝에서 다음 결과 묶음). 알림 `focus`와 검색 결과가
  같은 이동 로직을 씀 — 대상이 불러온 목록에 없으면 `fetchNextPage`를 찾을 때까지(최대 `MAX_FOCUS_PAGES`=20 × 50개). 이전엔 알림 focus가
  첫 50개 밖이면 그냥 무시됐음(같이 고쳐짐). 강조 해제 타이머를 별도 effect로 분리(폴링으로 목록이 바뀌면 cleanup이 타이머를 지워 강조가
  안 꺼지던 문제). `IconButton`에 `disabled` 추가.
- 한계: 많이 불러온 상태에서 폴링(연결 끊겼을 때)은 불러온 페이지를 전부 다시 받음 — react-query infinite 기본 동작. 실시간 연결 중엔
  30초 간격이라 부담 작음.

## 정산: 결제 기록(PurchaseCharge)·배분(ChargeAllocation), PC 넓은 화면 (2026-09-29)

- 스키마(`20260929140000_purchase_charges_settlement`): `PurchaseCharge`(결제 1건 — purchaseId는 SetNull로 팬 탈퇴 후에도 남음, actorId/
  bundleId/productName/amountCents/currency 복사, chargedAt/periodEnd, `ChargeSource` SANDBOX/APPLE/GOOGLE, storeTransactionId unique,
  refundedAt, `@@unique([purchaseId, chargedAt])`), `ChargeAllocation`(chargeId Cascade, roomId·actorId·agencyId는 Restrict — 돈 기록이 있는
  배우·소속사는 못 지움), `Agency.revenueSharePercent Int?`.
- `settlements/allocate-charge.ts`: `allocateCharge(amount, rooms)` — 방이 여럿이면 `allocateBundlePrice`(정가 비율), 커플방은 멤버에게 같은
  가중치로 다시 나눔. 반올림은 마지막 몫. `addMonths`는 월말 보정.
- `ChargeLedgerService.record(tx, purchaseId, input)`: 멱등(같은 purchase+chargedAt 또는 storeTransactionId면 기존 행, 동시 생성은 P2002 잡아서
  재조회). 배우 소속사는 `ActorAgencyHistory`에서 chargedAt을 포함하는 행, 이력이 아예 없는 배우만 현재 `agencyId`. 호출처: `subscribe`/
  `subscribeBundle`(SANDBOX), `verifyPurchase`(새 구매 = 첫 결제, 기존 구매의 만료일이 늘었으면 이전 만료 시각에 갱신 결제).
  `fillMissing()`(부팅 시 비동기 + 매시간 cron): 샌드박스 구매는 startedAt + k개월(해지 전·지금 이전), 스토어 구매는 기록이 없을 때 첫 결제만.
  기존 데이터 백필도 이걸로(마이그레이션 SQL엔 백필 없음). 로컬 12건 백필·재시작 후 중복 0 확인.
- `SettlementsService.report(month, { agencyId, includeSandbox })`: 태국 시간 월 범위(`monthRange`), allocation을 결제 순간 소속사 → 배우 →
  방으로 모음, 환불은 refundedCents로 분리. `splitRevenue`: 수수료 = round(gross×fee%), 지급 = round(net×share%), 토피 = 나머지(합 보존).
  수수료·지급은 배우 단위로 계산해 합산(소속사 합계 = 배우 합). `includeSandbox` 기본값 = `ENABLE_SANDBOX_SUBSCRIBE`. `toCsv`는 BOM + 배우별/
  배우×방별.
- API: `GET /settlements?month=YYYY-MM[&agencyId&includeSandbox]`, `GET /settlements/export?...&detail=true`(text/csv) — ADMIN·AGENCY_STAFF,
  `scopeFor`가 직원이면 자기 agencyId로 강제(요청의 agencyId 무시). `PATCH /admin/agencies/:id`에 `revenueSharePercent`(0~100, null = 기본값),
  변경 시 감사 기록 `AGENCY_SHARE`(targetType AGENCY, 이름 해석 추가). 운영자 작업 기록 화면에 빠져 있던 ACTOR_PRICE·BUNDLE_*·COUPLE_CREATE 라벨도 추가.
- 설정: `STORE_FEE_PERCENT`(15), `AGENCY_REVENUE_SHARE_PERCENT`(70).
- 앱: `hooks/use-settlements.ts`(`apiClient.getText`로 CSV → Blob 다운로드, 웹에서만 enabled), `components/settlement-report.tsx`(i18n 6개
  언어 — 소속사 콘솔이 태국어일 수 있어서), `admin/settlements`, `console/settlements`. `components/wide-shell.tsx`: 웹 && 폭 ≥ 1024 && 경로가
  /admin·/console이면 루트 Stack을 왼쪽 메뉴(248px) + 내용으로 감쌈(라우트 구조는 그대로). 운영자 메뉴는 `constants/admin-menu.ts`로 분리해
  홈 목록과 공유.
- 남은 일: 스토어 갱신·환불 알림으로 PurchaseCharge 기록(결제 연결 작업), 실제 결제 금액·통화(애플 JWS price/currency, 구글 orderId), 정산 마감
  (월 확정 스냅샷), 지급 처리 기록.

## 스토어 결제·서버 알림, 소셜 로그인 앱 연결 (2026-09-29)

**서버 — 결제**
- `IapVerificationService`가 `StoreTransaction`(originalTransactionId = Purchase.iapTransactionId, storeTransactionId = 결제 건 id(애플
  transactionId / 구글 orderId), productId, purchasedAt, expiresAt, accountToken(애플 appAccountToken / 구글 obfuscatedExternalAccountId),
  storeAmountMilli·storeCurrency)을 돌려줌. 애플 `SignedDataVerifier`는 한 번 만들어 재사용, **운영 환경은 appAppleId(`APPLE_APP_ID`) 필수**
  (예전 코드엔 없어서 운영 검증이 실패했을 것). 설정이 없으면 503(`SERVICE_UNAVAILABLE`, 예전엔 getOrThrow로 500).
- `SubscriptionsService.verifyStorePurchase(userId, dto, expected)`: accountToken ≠ userId → 409 `IAP_RECEIPT_IN_USE`, 만료 → 400
  `IAP_EXPIRED`, productId로 `Actor.storeProductId`/`Bundle.storeProductId` 조회(없으면 `IAP_PRODUCT_UNKNOWN`), 기대한 배우·묶음과 다르면
  `IAP_PRODUCT_MISMATCH`(예전엔 상품 확인이 없어서 싼 상품 영수증으로 비싼 방을 열 수 있었음). `upsertStorePurchase`: 같은 구독 인스턴스면
  만료일만 늘림(줄이지 않음), 새 구매면 판매 가능 확인. 결제 기록은 storeTransactionId로 멱등. 라우트: `POST actors/:id/verify-purchase`(기존 응답
  모양 유지), `POST bundles/:id/verify-purchase`, `POST me/purchases/restore`(최대 20개, 건별 결과).
- 스토어 알림: `store-notifications.controller.ts` — `POST /iap/apple/notifications`(signedPayload JWS 검증 → `appleStoreEvent`),
  `POST /iap/google/notifications`(Pub/Sub 푸시 OIDC 토큰을 `GOOGLE_RTDN_AUDIENCE`·`GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL`로 확인, 미설정이면
  404 → base64 data → `googleStoreEvent`, 결제·유예 알림은 Play API로 최신 상태 재조회). 둘 다 `StoreEvent`(PAID/GRACE/EXPIRED/REFUNDED/
  IGNORED)로 바꿔 `applyStoreEvent`에 넘김. PAID인데 우리 구매가 없으면 accountToken의 사용자로 생성(앱이 결제 직후 죽은 경우), 없으면 무시.
  REFUNDED는 `ChargeLedgerService.markRefunded(storeTransactionId)` + 구매 닫기. `sweepExpired`(매시간): `iapExpiresAt < now - IAP_EXPIRY_GRACE_HOURS(24)`.
- 스토어 구매 해지 요청(`cancelPurchase`/`unsubscribe`)은 409 `IAP_MANAGE_IN_STORE`. `listMine().coveredBy[].iapPlatform`으로 앱이 미리 분기.
- `PurchaseCharge.storeAmountMilli`·`storeCurrency`(마이그레이션 `20260929150000_charge_store_amount`) — 정산 금액(amountCents, 바트 정가)과
  별개로 실제 청구액 대조용.
- 테스트: `store-purchases.spec.ts`(메모리 DB — 상품 불일치·만료·다른 계정·묶음·복원·스토어 해지 거절·갱신 멱등·accountToken 생성·만료/환불/
  유예·만료 정리, 애플·구글 알림 해석, 구글 orderId 갱신 판별·micros 변환).

**서버 — 로그인**: `GOOGLE_CLIENT_ID`·`APPLE_CLIENT_ID`·`LINE_CHANNEL_ID` 쉼표 목록 허용(애플 idToken aud = 번들 ID라 `.dev` 빌드가 막혔음, LINE은
idToken aud로 채널 선택). 카카오는 `KAKAO_APP_ID`가 있으면 `/v1/user/access_token_info`의 app_id를 확인(토큰 바꿔치기 방지). 설정 없으면 거절.

**앱**
- `lib/social-sign-in.ts`(네이티브, 젤리 이식 — 운영/개발 키를 `extra.isProductionVariant`로 선택, 안드로이드도 분리) / `.web.ts`(구글만) +
  `components/social-login-buttons.tsx` / `.web.tsx`(구글 GIS `renderButton`, popup → credential = idToken). Metro 플랫폼 확장자로 웹 번들에
  네이티브 SDK가 안 들어감. `login.tsx`: `/auth/<provider>`로 교환, 개발 로그인 카드는 `__DEV__ || EXPO_PUBLIC_ENABLE_DEV_LOGIN`. 로그아웃 시
  `signOutProviders`.
- `app.config.ts`: `usesAppleSignIn`, `expo-apple-authentication`·LINE 플러그인은 항상, 구글(iosUrlScheme)·카카오(nativeAppKey)·네이버(urlScheme)
  플러그인은 키가 있을 때만(키 없이도 빌드), 카카오 maven 저장소, `extra.isProductionVariant`. `expo config --type prebuild`로 키 있는/없는 경우 해석 확인.
  **네이티브 빌드(EAS)는 아직 안 돌려 봄** — 첫 빌드 때 SDK 링크(static frameworks + Firebase) 확인 필요.
- `hooks/use-store-purchase.ts`(`.web.ts`는 항상 unavailable): `useIAP` + 대기 중 구매 Promise(ref), 결제창에 appAccountToken/obfuscatedAccountId
  = 사용자 id, 성공 → verify-purchase → `finishTransaction`(서버 확인 실패면 끝내지 않아 다음 실행에 재시도), 대기 없는 거래(재실행 시 재전달)는
  restore로. 복원은 `getAvailablePurchases()` → restore. 구독·묶음 구독 화면은 `available`이면 스토어, 아니면 샌드박스. `lib/store-subscriptions.ts`:
  스토어 구독 관리 URL. 예전 `use-purchase.ts`(쓰이지 않던 배우 전용 훅) 삭제.

## 정산 마감 SettlementClose (2026-09-29)

- 스키마 `SettlementClose { month(PK, YYYY-MM), closedAt, closedById, snapshot Json }`(마이그레이션 `20260929160000_settlement_close`).
- `SettlementsService.report`: 마감한 달이면 snapshot(소속사 범위만 필터·합계 재계산) + `closed {at, byId, byName}`, 아니면 `compute()`.
  `compute`: 이 달 결제(기존) + **조정** — `chargedAt < from`이고 `createdAt` 또는 `refundedAt`이 이 달인 allocation 중, 결제 달(`monthOf`)이
  마감됐고 그 사건 시각이 `closedAt` 이후인 것만(늦은 기록 +, 환불 −). 마감 안 한 달의 결제는 조정 없이 그 달 안에서 환불 처리.
  `splitRevenue(gross + adjustment)` — 음수 가능. 응답·CSV에 `adjustmentCents`, CSV에 status 열.
- `close(adminId, month)`: 끝난 달만(`SETTLEMENT_NOT_ENDED`), 중복 불가, 첫 결제 달부터 앞 달이 모두 마감돼야 함(`SETTLEMENT_CLOSE_ORDER`), 감사
  `SETTLEMENT_CLOSE`(targetType SETTLEMENT). `reopen`: 뒤 달이 마감돼 있으면 거절(`SETTLEMENT_REOPEN_ORDER`), 감사 `SETTLEMENT_REOPEN`.
  API `POST|DELETE /settlements/:month/close`(ADMIN). 사건 시각은 "기록된 시각"(환불 알림 도착 시각)이라 마감은 달이 끝난 뒤에만 허용 → 마감 뒤
  사건은 항상 뒤 달에 떨어짐.
- 테스트: `settlements.service.spec.ts`(메모리 DB — 마감 후 환불 −조정, 늦은 기록 +조정, 마감 전 환불은 조정 없음, 순서·중복·미종료 거절).
  로컬 확인: 8월 마감 → 8월 결제 환불 → 9월 조정 −฿99, CSV 반영.
- 앱: `useSettlementClose`, 정산 화면 마감 상태 줄(자물쇠·마감/마감 취소 버튼 — `canClose`는 운영자 화면만), 조정 카드·열.

## 스타 미발송 환불 IdleRefund + 환불 기준 경고 (2026-09-29)

- (같은 날 이어서 `refund.service.ts` `RefundService`로 이름 바꾸고 활동 종료 사유 추가 — 아래 절) 판정 `IdleRefundService.candidates(userId)`: 내 `PurchaseCharge` 중 `refundedAt null`이고
  `periodEnd ∈ (now − IDLE_REFUND_REQUEST_DAYS(7), now]`, 그 결제의 `ChargeAllocation.roomId`(묶음이면 여러 방) 전부에서 `[chargedAt, periodEnd)` 동안
  `Message(senderType ARTIST, deletedAt null)` 0개. allocation이 없는 결제는 대상 아님. 팬 답장은 안 봄.
- 요청 `request(userId, chargeId)`: 후보 재확인 → SANDBOX `refundedAt` 직접, GOOGLE `IapVerificationService.refundGoogleOrder(orderId)`
  (`POST .../orders/{orderId}:refund?revoke=false` — 그 주문만, 구독 유지. 서비스 계정 "주문 관리" 권한) 후 `ledger.markRefunded`, APPLE은
  `STORE_GUIDED` + `https://reportaproblem.apple.com/`(서버 환불 API 없음). 기록 `RefundRequest { chargeId, userId, reason 'STAR_IDLE', source, status }`
  `@@unique([chargeId, reason])` — 구글/테스트는 행을 먼저 만들고(P2002면 이미 처리) 환불 실패 시 지움(중복 클릭 방지). 마이그레이션
  `20260929200000_refund_request`. API `GET /me/refunds/idle`, `POST /me/refunds/idle/:chargeId`.
- **스토어 환불 알림 보정**: `applyStoreEvent(REFUNDED)`에서 환불된 `storeTransactionId`의 `periodEnd`가 이미 지났으면 결제만 환불 처리하고
  구매(방)는 닫지 않음 — 지난달만 환불한 경우 지금 기간 이용이 끊기지 않게. 현재 기간 결제나 transactionId 없는 REVOKED는 전처럼 닫음.
- 경고 `notifications/idle-reminder.ts`: `refundDays`(`IDLE_REFUND_DAYS`, 30) 추가, `idleStage`가 27~28일 → 27, 29일 → 29(그 구간엔 7일 반복 28 대신),
  `refundWarningLeft(stage)`로 경고 단계면 배우 + `notifyActorStaff` + ADMIN(ACTIVE) 전원에 `idleRefundTitle/Body`. 30~34일은 반복 단계 28 < 저장된 29라 안 울림.
- 앱: `components/idle-refund-section.tsx`(구독 관리 ListHeader 맨 위, 대상 없으면 안 보임). mutation은 구역에 둠 — 환불되면 카드가 목록에서 빠져서
  카드 안 콜백은 안 불림(처음엔 결과 문구가 안 보였음). 테스트: `idle-refund.service.spec.ts`, `idle-reminder.spec.ts`, `store-purchases.spec.ts`.

## 환불 확장: 활동 종료·입대 + 운영자 목록 (2026-09-29)

- `subscriptions/refund.service.ts` `RefundService`(이전 IdleRefundService). 후보 조회: `refundedAt null`, `periodEnd > now − REFUND_REQUEST_DAYS`,
  `chargedAt ≤ now`인 내 결제마다 사유 하나 — **ACTOR_RETIRED** 먼저: 결제의 allocation 방이 전부 종료(`roomsEndedAt` — 방의 종료 시각 = 방 `retiredAt`과
  커플 멤버 `retiredAt` 중 가장 이른 것, 묶음은 그중 가장 늦은 것)이고 종료 시각 `< chargedAt + RETIRE_REFUND_DAYS(14)`·`< periodEnd`·`≤ now`
  (결제 전 이미 종료된 방의 갱신 결제도 대상) → 기간 중에도 바로 요청, 기한 `periodEnd + 7일`. 아니면 **STAR_IDLE**(기존 규칙). 재개하면 `retiredAt null`이라 후보에서 빠짐.
- API 이름 정리: `GET /me/refunds`, `POST /me/refunds/:chargeId`(앱만 쓰던 `/me/refunds/idle`은 제거). `RefundRequest.reason`에 `ACTOR_RETIRED`.
- 활동 종료 알림: `AdminActorsService.setRetired`가 새로 종료할 때만(`wasRetired` 아니면) 그 배우 방 + 들어 있는 커플방(`CoupleMember.memberId`)의
  활성 구독 팬에게 `retiredFanTitle/Body` 푸시(AdminModule이 NotificationsModule import).
- 운영자 목록: `AdminRefundsController` `GET /admin/refunds?reason=`(ADMIN) → `RefundService.adminList` — 최근 200건, 팬(지금 닉네임·이메일, 탈퇴면 null),
  결제의 allocation 배우·소속사, `charge.refundedAt`(애플 안내 건이 실제로 환불됐는지 — 애플 REFUND 알림이 채움). 앱 `app/admin/refunds.tsx`(한국어 전용).
- 확인: 단위 테스트(기간 중 종료 즉시 대상·14일 지나 종료는 아님·결제 전 종료된 방 갱신 결제는 대상·묶음 일부 종료는 아님), 로컬에서 Chanon 종료 →
  팬 후보 ACTOR_RETIRED → 환불 → 운영자 목록 → 재개·데이터 정리.

## 검색 속도: pg_trgm GIN 색인 (2026-09-29)

- `ILIKE '%…%'`(Prisma `contains` + `mode: 'insensitive'`)는 btree를 못 써서 행이 늘면 전체를 훑음. 가장 커질 두 곳에 글자 조각 색인:
  `Message.body`(방 안 검색 — 팬 답장까지 한 테이블이라 인기 배우는 `[actorId, createdAt]` 범위도 큼), `User.displayName/nickname/email`(운영자 회원 검색).
  배우·소속사 이름은 행이 적어서 안 넣음.
- 스키마: generator `previewFeatures = ["postgresqlExtensions"]`, datasource `extensions = [pg_trgm]`, `@@index([body(ops: raw("gin_trgm_ops"))], type: Gin,
  map: ...)` — 스키마에 적어야 `migrate diff` 드리프트 검사가 색인을 지우라고 안 함. 마이그레이션 `20260929190000_search_trigram_index`
  (`CREATE EXTENSION IF NOT EXISTS pg_trgm` 포함 — 운영 DB가 확장 설치를 허용해야 함, RDS·Cloud SQL·Supabase·Neon 모두 기본 허용).
- 확인: `EXPLAIN`(seqscan off)에서 한국어 `'%사랑해요%'`·영문 모두 `Bitmap Index Scan on Message_body_trgm_idx`. 한계: 검색어가 2글자면 3글자 조각이
  없어서 색인 효과 없음(결과는 정확, 기존처럼 훑음). 쓰기 비용이 조금 늘어남(GIN) — 메시지 쓰기 빈도 대비 문제없는 수준.
- 같이: `escapeLike`를 `common/utils/escape-like.ts`로 옮기고 배우·소속사·운영자 배우/회원 검색에도 적용(`%` 하나로 전부 나오던 것).

## 정산 지급 기록 SettlementPayout (2026-09-29)

- 스키마 `SettlementPayout { id, month → SettlementClose(onDelete Restrict), agencyId?, actorId?, payeeKey, name, amountCents, paidAt, reference?, memo?,
  recordedById?, createdAt }`, `@@unique([month, payeeKey])`(마이그레이션 `20260929180000_settlement_payout`). `payeeKey`는 `agency:<id>` | `actor:<id>` —
  nullable 두 열에 unique를 걸면 null끼리 안 막혀서 따로 둠. agency/actor는 관계 없이 id + 그때 이름(`name`)만(지워져도 기록 보존).
- `SettlementsService.recordPayout(adminId, month, dto)`: 마감한 달만(`SETTLEMENT_NOT_CLOSED`), 받는 쪽은 snapshot에서 찾음 — `agencyId`면 소속사 그룹
  합계, `actorId`면 무소속 그룹(agencyId null) 안의 배우. 둘 다/둘 다 없음/없는 받는 쪽/지급액 ≤ 0이면 `SETTLEMENT_PAYOUT_INVALID`, 중복은
  `SETTLEMENT_PAYOUT_EXISTS`. `amountCents` 생략 시 표의 지급액. 감사 `SETTLEMENT_PAYOUT`(detail payee·amountCents·expectedCents).
  `deletePayout`: 감사 `SETTLEMENT_PAYOUT_DELETE`. `reopen`: 지급 기록이 있으면 `SETTLEMENT_REOPEN_PAID`.
- API(ADMIN): `POST /settlements/:month/payouts`(`SettlementPayoutDto`), `DELETE /settlements/:month/payouts/:payoutId`(204).
  `report()` 응답에 `payouts[]`(마감한 달만, 소속사 범위면 그 소속사 것만 — 소속사 직원은 자기 것만 봄), CSV 요약에 `paid_at` 열.
- 앱: `components/settlement-payout.tsx` `PayoutBar`(표 아래 한 줄 — 지급 완료/보낼 금액/음수 안내, 운영자면 기록 폼·지우기), `useSettlementPayouts`.
  날짜만 입력받아 `YYYY-MM-DDT12:00:00+07:00`으로 보냄(어느 시간대에서도 같은 날). 테스트: `settlements.service.spec.ts` "정산 지급 기록".

## PC 웹 소셜 로그인(authorization code) (2026-09-29)

- 서버: `POST /auth/{kakao|naver|line}/web`(`WebCodeLoginDto` code·redirectUri·state) → `AuthService.verify{Kakao|Naver|Line}WebCode`: redirectUri의
  origin이 `WEB_LOGIN_ORIGINS`(쉼표)에 있어야 함(없으면 웹 로그인 꺼짐) → 토큰 교환(카카오 `kauth.kakao.com/oauth/token` REST 키 + 선택 client
  secret, 네이버 `nid.naver.com/oauth2.0/token` client id/secret + state, LINE `api.line.me/oauth2/v2.1/token` 웹 채널 id/secret) → 기존
  `verifyKakaoToken`(앱 ID 확인 포함)·`verifyNaverToken`·`verifyLineToken`(aud로 채널 선택 — `LINE_WEB_CHANNEL_ID`가 `LINE_CHANNEL_ID` 목록에 있어야 함).
  로그인 제한(5회/분)은 앱 로그인과 같음. 테스트: 허용 안 된 origin·설정 없음은 외부 호출 없이 거절, 카카오·LINE 교환 흐름(fetch 목).
- 앱(웹): `lib/social-sign-in.web.ts` — `startRedirectLogin`(state = 16바이트 무작위, `sessionStorage`에 `provider:state`, redirect `<origin>/oauth/<provider>`,
  LINE은 scope `profile openid`), `consumeRedirectState`(1회용). `app/oauth/[provider].tsx`: state 확인 후 1회만 서버 호출(ref 가드) → `login()`, AuthGate는
  `oauth`를 로그인 화면처럼 취급. 버튼 색·순서는 `components/social-button-style.ts`로 앱·웹 공유. 키: `EXPO_PUBLIC_WEB_KAKAO_REST_API_KEY`·
  `EXPO_PUBLIC_WEB_NAVER_CLIENT_ID`·`EXPO_PUBLIC_WEB_LINE_CHANNEL_ID`. 브라우저 확인: 버튼 → 카카오 authorize URL(client_id·redirect_uri·state),
  위조 state 거절(서버 호출 없음), 맞는 state면 code 1회 전송.
- 애플 웹은 Services ID + client secret(JWT, .p8 서명)가 필요해서 보류. → 2026-09-29 추가: `POST /auth/apple/web` →
  `AuthService.verifyAppleWebCode` — `ensureWebRedirect` → `apple-signin-auth` `getClientSecret`(ES256, iss 팀 ID, sub Services ID, 5분) →
  `getAuthorizationToken` → `verifyIdToken(audience = APPLE_WEB_SERVICES_ID)`. env `APPLE_WEB_SERVICES_ID`·`APPLE_TEAM_ID`·`APPLE_SIGNIN_KEY_ID`·
  `APPLE_SIGNIN_PRIVATE_KEY`(\n 한 줄). 앱: `WEB_KEYS.apple`(`EXPO_PUBLIC_WEB_APPLE_SERVICES_ID`), authorize에 **scope 없이 `response_mode=query`** —
  name/email scope를 넣으면 애플이 form_post만 허용해서 정적 웹(/oauth/apple)으로 못 받음. 그래서 웹 신규 가입은 이메일 없이 생김(웹은 기존 계정
  로그인 용도). 회원 식별값(sub)이 앱과 같으려면 Services ID를 iOS App ID와 같은 그룹(Primary App ID)으로. 애플은 https Return URL만 → localhost
  확인 불가, 브라우저 확인은 authorize URL·state·서버 호출까지. 테스트: `auth.service.spec.ts`(가짜 애플 서버 `_setFetch` — client secret 서명·
  audience 불일치 거절).

## 보안 점검 (2026-09-29)

범위: 인증(JWT 전략·역할 가드·공개 경로 21개), 운영자 컨트롤러 역할, 공개 배우 응답 필드, 스토리·신고 접근, 법률 HTML 이스케이프, 결제·스토어
알림, 정산, 웹 로그인, 의존성.
- 문제없음: JWT는 매 요청 DB에서 역할·정지·탈퇴 재확인, 운영자 경로 전부 `@Roles(ADMIN)`, 공개 배우 응답에 계정·이메일 없음, 스토리·신고는
  구독/열람 권한 확인, 법률 페이지 escapeHtml, 정산 소속사 범위 강제, 웹 로그인 state·허용 origin.
- 고침: ① **스토어 알림 순서** — 애플·구글 알림은 순서 보장이 없어서 옛 EXPIRED가 갱신 뒤에 오면 결제한 팬의 방을 닫았을 것 → EXPIRED에
  알림의 만료 시각을 싣고(구글은 API로 최신 상태 재조회), 아직 미래거나 우리가 아는 만료일보다 옛날이면 무시. ② **동시 결제 확인** — 같은
  영수증이 동시에 두 번 오면 `iapTransactionId` 고유 제약으로 500 → P2002면 기존 구매 경로로 한 번 더. ③ **정산 CSV 수식 주입** — =,+,-,@로
  시작하는 글자 칸 앞에 `'`(숫자는 제외). ④ 의존성: `npm audit fix`(비파괴)로 multer(업로드 DoS)·firebase-admin 계열 갱신. 남은 4건은 Prisma
  CLI 쪽(mysql2·deepmerge-ts — Postgres 런타임과 무관, 고치려면 Prisma 메이저 다운그레이드라 보류). 앱은 high/critical 없음(moderate 21, Expo 빌드 도구).
- 알고 두는 위험: 웹은 로그인 토큰을 localStorage에 둠(XSS가 나면 탈취 가능 — 사용자 입력을 HTML로 그리는 곳 없음, React가 이스케이프).

## 스타 장기 미발송 알림 (2026-09-29)

- `notifications/idle-reminder.ts`: `idleStage(days, rule)` — 3일 → 3, 7~13 → 7, 14~20 → 14 …(firstDays/escalateDays/repeatDays).
- `IdleReminderService.run(now)`(cron `5 12 * * *` Asia/Bangkok, `IDLE_REMINDER_ENABLED=false`면 끔): 구독자가 있고 활동 종료 아닌 방(멤버 포함) →
  `message.groupBy`로 마지막 ARTIST 메시지(없으면 방 createdAt) → 단계. `Actor.idleReminderStage`·`idleReminderFor`(기준 시각)로 같은 단계 한 번만,
  `updateMany`의 조건부 갱신이 여러 서버 사이 잠금 역할(count 0이면 다른 서버가 이미 보냄). 배우: selfUserId(커플방은 멤버들), 단계 ≥ escalate면
  `notifyActorStaff`. 푸시 data `{type:'idle-reminder', actorId}` — 앱의 기존 알림 라우팅(역할별 스튜디오/콘솔)을 그대로 씀. 문구 6개 언어
  `push-messages.ts`. 마이그레이션 `20260929170000_actor_idle_reminder`.
- 목록: `ActorsService.lastBroadcastMap(ids)` → `/actors/mine`(콘솔)·`/admin/actors` 응답에 `lastBroadcastAt`. 앱 `utils/idle-days.ts`(7일 이상 빨간색).
  콘솔 행 글자 뒤 흰 박스(ThemedView 기본 배경) 같이 고침.
- 테스트: `idle-reminder.spec.ts`(단계, 3일 배우만·다음 날 중복 없음, 7일 커플방 두 배우 + 소속사, 새 메시지 후 초기화).

## 메시지 번역 (2026-09-29)

- `translation/translation-provider.ts`: `TranslationProvider { name, cacheable, translate(text, target) }`. `ClaudeTranslationProvider` — `@anthropic-ai/sdk`
  (0.129) `client.beta.messages.create`, 모델 `TRANSLATION_MODEL`(기본 `claude-opus-5-5`), `output_config.effort: 'low'`, 거절 시 서버 대체
  (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`), `stop_reason` refusal/max_tokens 처리, text 블록만 이어 붙임. 시스템 프롬프트는
  고정 문자열(`TRANSLATION_SYSTEM_PROMPT` — 말투·이모지·`{{name}}` 유지, `<message>` 안은 지시로 따르지 않음), 사용자 턴에 `<target_language>`·`<message>`.
  `FakeTranslationProvider`(cacheable false — 저장 안 함).
- `TranslationService.translateMessage(requester, actorId, messageId, target)`: 지운 메시지·본문 없음 404, 팬(USER)은 구독 + 구독 시작 이후 + (스타 메시지 또는 본인 답장)만
  (아니면 404 — 존재 여부도 안 알림), 스타·소속사·운영자는 `ensureCanViewActor`. `MessageTranslation(messageId, languageCode)` 캐시(원문 기준, `{{name}}` 포함),
  동시 저장 P2002는 저장된 것 사용. 팬에게 스타 메시지는 `{{name}}` → 닉네임. 엔진 선택 `pickProvider`: `TRANSLATION_PROVIDER` claude|fake|off, 비면 키 있으면
  claude, 없으면 NODE_ENV production이면 null(503 `TRANSLATION_UNAVAILABLE`) 아니면 fake. 번역 실패 503 `TRANSLATION_FAILED`.
- API `POST /actors/:actorId/messages/:messageId/translate { targetLanguage }`, 사람당 30회/분.
- 앱: `utils/detect-script.ts`(글자 종류로 "다른 언어인지" — 가나가 있으면 일본어), `useMessageTranslation`(누를 때만, staleTime/gcTime Infinity),
  `components/translatable-text.tsx`(원문 + 번역 보기/숨기기) — 채팅 스타 말풍선·스튜디오 팬 답장.
- `scripts/translation-sample.mjs`: 빌드 후 예문 × 언어로 실제 호출(키 필요, 비용 발생).
- 테스트 `translation.service.spec.ts`(한 번만 번역·캐시·{{name}}, 팬 권한, 가짜 미저장·꺼짐, 엔진 선택, 프롬프트).

## 앱 자동 테스트 (2026-09-29)

- 단위: `app/vitest.config.ts`(`@` 별칭, `src/**/*.test.ts`, node 환경) — 화면 없이 순수 로직만(`utils/*`, 로그인 버튼 순서). 정산 달 계산은
  `utils/month.ts`로 옮김(훅 파일이 react-native를 불러서 테스트에서 못 씀). `npm test`, CI app 잡에도 추가.
- 끝-끝: `app/e2e/run.mjs`(Playwright 1.56, `npm run e2e`) — 서버(시드, 개발 로그인·샌드박스 구독 켜짐)·`expo start --web`을 띄운 상태에서 새 팬 가입(약관·
  생년월일·닉네임) → 구독 → 배우 발송(API, 배우 본인 계정)이 채팅방에 닉네임으로 보임 → 답장 → 방 안 검색. 끝나면 보낸 메시지 삭제·팬 해지·탈퇴.
  실패 화면 `e2e/last-failure.png`. CI엔 안 넣음(서버·DB·웹을 다 띄워야 해서, 필요해지면 별도 잡).
- 발견: 웹 첫 화면이 미리 그려진 뒤 앱 코드가 붙는 동안 입력한 값이 초기값으로 되돌아감, Playwright `fill`은 RN 웹 TextInput 상태를 안 바꿀 때가 있음 →
  `networkidle` 대기 + 한 글자씩 입력. 사람이 쓸 때는 문제없음(입력 이벤트가 정상).
- 설치 주의: npm 10(Node 22 기본)의 의존성 계산 버그(`Cannot read properties of null (reading 'edgesOut')`)로 `npm install -D vitest`가 실패 —
  `npx npm@11 install -D <패키지> --package-lock-only`로 잠금 파일을 만든 뒤 `npm ci`. `--legacy-peer-deps`로 설치하면 잠금 파일에서 peer 패키지가 빠져
  CI의 `npm ci`가 실패하니 쓰지 말 것.

## 데모 서버: 입장 코드·데이터 넣기 (2026-10-01)

- 호스팅: Railway 프로젝트 `toffee-demo`(서버 + Postgres, 싱가포르). 서비스 Root Directory `/backend`, 설정은 `backend/railway.json`
  (Root Directory를 따라가지 않아 서비스 설정에 `/backend/railway.json`을 절대 경로로 지정). 포트는 Railway가 주는 `PORT`(8080).
- 데모는 `NODE_ENV=development` — 소셜 키 전이라 `/auth/dev-login`·샌드박스 구독이 필요한데 production이면 `env-check`·`DevOnlyGuard`가 막음.
- **`DEV_LOGIN_CODE`**: 있으면 `AuthService.devLogin`이 `dto.code`를 sha256 다이제스트끼리 `timingSafeEqual`로 비교, 틀리면
  401 `DEV_LOGIN_CODE_INVALID`(upsert 전이라 계정도 안 생김). 앱 `login.tsx` 개발 로그인 카드에 코드 칸, `e2e/run.mjs`는 `DEV_LOGIN_CODE`
  환경변수가 있으면 같이 입력. 무차별 대입은 전역 스로틀(분당 60)뿐이라 코드는 길게(단어 3개 이상).
- **`DEMO_SEED`**: 시드 본문을 `src/demo/demo-seed.ts`(`seedDemo(prisma)`)로 옮겨 `nest build`에 포함, `prisma/seed.ts`는 로컬용 래퍼.
  `docker-entrypoint.sh`가 마이그레이션 뒤 `node dist/demo/seed-cli.js` — `true`=회원 0명일 때만, `reset`=항상, production=무시
  (`decideSeed`). 실패해도 서버는 켬(로그). 시드가 지우는 테이블에 RefundRequest·Settlement*·AdminAction·ActorFanBlock·
  SubscriptionEvent·PushDevice·ParentalConsent 추가(Restrict FK로 초기화가 막히던 것).
- **운영자 화면 데모 초기화**(같은 날 추가): `DemoModule` — `GET /admin/demo`(`{enabled}`), `POST /admin/demo/reset`(ADMIN, 분당 3회,
  `isDemoServer`가 아니면 404). `prisma.$transaction(tx => seedDemo(tx), { timeout: 60s })` — `seedDemo`는 `Prisma.TransactionClient`를
  받음. 시드의 소속사·배우·묶음·데모 회원은 `DEMO_IDS` 고정 UUID(`00000000-0000-4000-8000-…`) — JWT `sub`가 그대로 유효해서
  초기화 뒤에도 데모 계정 로그인이 유지됨(JwtStrategy가 매 요청 회원을 다시 읽음). `DEMO_SEED` 해석은 `src/demo/demo-mode.ts`로 공유.

