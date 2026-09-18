# Toffee — Claude Code 메모리

이 저장소에서 작업을 시작하기 전에 먼저 읽을 것.

## 문서 구조

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
4. 이 저장소는 git에 커밋되므로, 이 규칙은 계정/세션이 달라도(다른 사람이 이 레포를
   Claude Code로 열어도) 자동으로 적용된다 — 세션 로컬 설정에는 이런 규칙을 넣지 말 것.

## 세션 환경

- `node_modules`가 커밋되어 있지 않음 — `backend/`, `app/` 각각에서 `npm ci`(또는
  peer dependency 충돌 시 `npm install --legacy-peer-deps` — 알려진 이슈는
  `docs/engineering/architecture-notes.md` 참고) 먼저 실행해야 `tsc`/lint/`prisma`
  커맨드가 동작함.
- 이 원격 세션엔 DB 연결이 없는 경우가 많음 — `npx prisma migrate dev`는 못 씀.
  스키마를 고치면 `npx prisma format` → `npx prisma generate` → `npx prisma validate`로
  검증하고, 마이그레이션 SQL은 `prisma/migrations/`의 기존 파일을 본떠 손으로 작성할
  것. 파일명은 `YYYYMMDDHHmmss_설명` 형식.
- 커밋 전엔 최소 `backend`: `npx tsc --noEmit`, `npm run lint`(oxlint), `npx nest build`
  / `app`: `npx tsc --noEmit`, `npx eslint src` 통과를 확인할 것(자동화 테스트는 아직
  없음).

## 코드 컨벤션

- 젤리(gelly)의 설계 패턴을 참고하되 그대로 따라가지 않는다 — ID 필드 검증
  (`@IsUUID()` 대신 `@IsString()+@IsNotEmpty()`), `ValidationPipe`
  (`whitelist/forbidNonWhitelisted/transform`) 같은 도메인과 무관한 일반 엔지니어링
  위생은 그대로 가져오고, `*EditProposal`(제안-승인) 패턴처럼 젤리의 특정 도메인
  (일정/장소 관리)에 묶인 패턴은 억지로 따라가지 않는다. Sentry/CI/EAS 멀티프로필/
  헬스체크 분리처럼 사업 모델과 무관한 운영 인프라도 젤리 걸 그대로 가져오는 게 맞다.
- 브랜드 톤·컬러·타이포는 `docs/product/brand-guide.md` 기준을 따른다 — 새 화면을
  만들 때 마음대로 색을 새로 정하지 말 것.
