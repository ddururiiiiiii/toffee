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
| 브랜드 팔레트/폰트 적용 | **완료** — `app/src/constants/theme.ts`, Noto Sans Thai |

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
  경로는 잡아뒀지만 **파일 자체는 없음**(Firebase 프로젝트 생성 전) — 없으면 prebuild가 실패하므로 스토어
  빌드 전에 운영 보류 목록대로 넣을 것.
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
- `app.json` 플러그인 `@sentry/react-native/expo`(`organization: ddururiiiiiii`,
  `project: toffee-app` — 젤리와 같은 조직 가정, Sentry에서 이 이름으로 프로젝트를 만들어야
  함). 소스맵 업로드는 EAS 빌드 시 `SENTRY_AUTH_TOKEN`이 있어야 동작.
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
- `Fonts.sans`가 `NotoSansThai_400Regular`를 가리키고 `ThemedText`의 `styles.base`에
  전역 적용됨. 지금은 Regular(400) 굵기만 로드 — 굵기별(Bold 등) 폰트 파일 추가는 후속
  작업.
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
