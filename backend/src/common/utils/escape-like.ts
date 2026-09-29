// Prisma의 contains는 LIKE의 %·_를 그대로 넘겨서 "%%"가 전부와 맞음 — 글자 그대로 찾도록 이스케이프(Postgres 기본 이스케이프 문자 \\).
// 검색창이 있는 곳(방 안 검색, 배우·소속사·회원 검색)은 모두 이걸 거칠 것
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
