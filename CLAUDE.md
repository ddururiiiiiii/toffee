# Toffee — Claude Code 메모리

이 저장소에서 작업을 시작하기 전에 먼저 읽을 것.

## 문서 구조

- [`STATUS.md`](./STATUS.md) — **진행 현황 한눈에 보기**(1차 완성/2차/보류, 기능별 ✅🔶⬜👤).
  사용자가 "어디까지 됐지?"를 매번 묻지 않아도 되게 하는 게 목적(2026-09-28 도입). 기능을
  만들거나 상태가 바뀌면 **같은 커밋에서** 해당 줄을 갱신하고 "마지막 갱신" 날짜를 바꿀 것.
  사용자가 새 기능을 요청하면 1차 목록에 없는 한 바로 만들지 말고 "아이디어 보관함"에 적은 뒤
  1차/2차 중 어디에 넣을지 먼저 확인할 것(1차 범위가 계속 늘어나는 걸 막기 위함).
- **정책 결정이 필요한데 개발을 막을 때**(환불·제재 기준처럼 사업·법률 판단이 필요한 것): 사용자에게
  하나하나 확정을 요구하지 말고, 근거와 함께 **추천안을 잠정 결정으로 적용**해서 개발을 계속한다 —
  `STATUS.md` "출시 전 확정할 정책" 표에 추가하고, 나중에 바꾸기 쉽게(설정값·문구 수준) 만든다
  (2026-09-28 사용자 방침: 결정 부담 때문에 진도가 안 나가는 걸 피하기 위함). 되돌리기 어려운 것
  (스키마 대공사, 외부 계약·비용 발생)은 예외로 먼저 묻는다.

- [`docs/product/`](./docs/product/) — 기획/디자인 문서. **개발자가 아니어도 읽을 수
  있게** 쓴다(사업 파트너, 디자이너, 나중에 합류할 비개발자 팀원 기준).
- [`docs/engineering/`](./docs/engineering/) — 기술 문서. 개발자가 이해할 정도면
  충분하다 — 코드 경로, 함수명, 스키마를 그대로 써도 됨.
- [`docs/deployment-readiness-plan.md`](./docs/deployment-readiness-plan.md) — 세션마다
  쌓이는 날짜순 작업 로그(로드맵 문서). "지금 무엇을 왜 했는지"는 여기, "지금 기준
  최신 상태가 뭔지"는 위 두 폴더에 정리한다.

### 문서 자동 업데이트 — 사용자가 별도로 요청하지 않아도 항상 할 것

비중 있는 작업(기능 결정, 아키텍처 변경, 스키마 변경, 디자인/브랜드 확정 등)을
마치면, 다음을 **묻지 않고 그때그때** 한다:

1. `docs/deployment-readiness-plan.md`에 그날 날짜로 무엇을 왜 했는지 기록(기존
   항목들과 같은 톤 — 원인, 결정, 남은 일).
2. 그 결정이 **제품/기획 성격**이면 `docs/product/`의 관련 문서(`feature-decisions.md`,
   `brand-guide.md` 등)를 새로 만들거나 기존 문서를 업데이트 — 로그에만 남기고 끝내지
   않는다. 비개발자가 읽어도 이해할 수 있는 문장으로 쓴다.
3. 그 결정이 **기술/구현 성격**이면 `docs/engineering/architecture-notes.md`(또는
   주제가 커지면 새 파일)를 업데이트 — 개발자 기준으로 쓰면 되고, 전문 용어나 코드
   경로를 굳이 풀어 쓸 필요 없다.
4. 운영·인프라·사업 쪽 결정(계정, 호스팅, 외부 서비스 가입, 계약 등)은 **결정만 기록하고
   실제 작업은 미룬다** — [`docs/product/ops-infra-backlog.md`](./docs/product/ops-infra-backlog.md)에
   추가할 것(2026-09-28 사용자 방침: 기능 개발 먼저). 기능 개발이 외부 계정 때문에 막히면
   로컬 대체품(가짜 S3, 키 없는 Sentry 등)으로 우회하고 계정 정보만 나중에 넣게 만든다.
5. 이 저장소는 git에 커밋되므로, 이 규칙은 계정/세션이 달라도(다른 사람이 이 레포를
   Claude Code로 열어도) 자동으로 적용된다 — 세션 로컬 설정에는 이런 규칙을 넣지 말 것.

## 세션 환경

- `node_modules`가 커밋되어 있지 않음 — `backend/`, `app/` 각각에서 `npm ci` 먼저 실행해야 `tsc`/lint/`prisma`
  커맨드가 동작함.
- 이 원격 세션엔 DB 연결이 없는 경우가 많음 — `npx prisma migrate dev`는 못 씀.
  스키마를 고치면 `npx prisma format` → `npx prisma generate` → `npx prisma validate`로
  검증하고, 마이그레이션 SQL은 `prisma/migrations/`의 기존 파일을 본떠 손으로 작성할
  것. 파일명은 `YYYYMMDDHHmmss_설명` 형식.
- 커밋 전엔 최소 `backend`: `npx tsc --noEmit`, `npm run lint`(oxlint), `npm test`, `npx nest build`
  / `app`: `npx tsc --noEmit`, `npx eslint src`, `npm test` 통과를 확인할 것(화면 흐름을 바꿨으면 서버·웹을 띄우고 `npm run e2e`도). GitHub Actions CI(`.github/workflows/ci.yml`)는
  Actions 무료 시간을 아끼려고 **main 대상 PR/push에서만** 자동으로 돎(작업 브랜치 push에선 안 돎,
  2026-09-28) — 그래서 스키마를 바꿨다면 로컬 Postgres에 `prisma migrate deploy` 후
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`로
  드리프트 검사까지 직접 할 것. main 반영은 사용자가 요청할 때만. 백엔드는 ESLint가 아니라 oxlint라 `npx eslint src`를 치면 설정 파일이 없다고
  실패함(정상). 앱 `tsc`가 `*.module.css`/`global.css` 타입을 못 찾는다고 실패하면
  gitignore된 `app/expo-env.d.ts`가 없는 것 — `/// <reference types="expo/types" />`
  한 줄로 만들어 주거나 `npx expo start`를 한 번 띄우면 자동 생성됨.

## 코드 컨벤션

- 젤리(gelly)의 설계 패턴을 참고하되 그대로 따라가지 않는다 — ID 필드 검증
  (`@IsUUID()` 대신 `@IsString()+@IsNotEmpty()`), `ValidationPipe`
  (`whitelist/forbidNonWhitelisted/transform`) 같은 도메인과 무관한 일반 엔지니어링
  위생은 그대로 가져오고, `*EditProposal`(제안-승인) 패턴처럼 젤리의 특정 도메인
  (일정/장소 관리)에 묶인 패턴은 억지로 따라가지 않는다. Sentry/CI/EAS 멀티프로필/
  헬스체크 분리처럼 사업 모델과 무관한 운영 인프라도 젤리를 출발점으로 삼는다.
- **단, 젤리는 참고만 한다(2026-09-28 사용자 방침)** — 토피는 실제 운영되는 **유료 서비스**라 젤리(무료
  커뮤니티 앱)에서 괜찮았던 단순화를 그대로 가져오지 말고 유료 기준으로 다시 판단할 것. 예: 젤리는 계정당
  푸시 기기 1대였지만 토피는 여러 기기 + 묶음 발송(`PushDevice`), 결제·환불·콘텐츠 유출·개인정보는 항상
  더 엄격한 쪽으로.
- 브랜드 톤·컬러·타이포는 `docs/product/brand-guide.md` 기준을 따른다 — 새 화면을
  만들 때 마음대로 색을 새로 정하지 말 것.
