/**
 * 대화방 사진의 시작값(2026-10-02 사용자 결정) — 처음엔 공식 사진, 배우가 바꾸면 그 사진, 배우가 지우면 사람 모양 기본 프로필.
 * 그래서 공식 사진이 **처음** 생길 때(이전 공식 사진 없음) 대화방 사진이 비어 있으면 같은 파일을 대화방 사진으로도 씀.
 * 이미 공식 사진이 있던 배우는 건드리지 않음 — 배우가 대화방 사진을 지운 상태(기본 프로필)를 운영자의 공식 사진 교체가 덮어쓰지 않게.
 * 같은 파일을 두 칸이 같이 가리켜도 updateImages가 "아직 쓰는 파일"은 지우지 않음.
 */
export function withFirstOfficialAsChat(
  current: { officialProfileImageUrl: string | null; chatProfileImageUrl: string | null },
  changes: { official?: string | null; chat?: string | null },
): { official?: string | null; chat?: string | null } {
  const firstOfficial = !!changes.official && current.officialProfileImageUrl === null;
  if (firstOfficial && changes.chat === undefined && current.chatProfileImageUrl === null) return { ...changes, chat: changes.official };
  return changes;
}
