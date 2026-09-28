// 스타 메시지의 {{name}} 자리는 받는 팬마다 그 팬의 닉네임으로 바뀜(서버가 팬 응답에서 치환).
// 스타·소속사 화면에선 원문 그대로 보이면 코드처럼 보여서 "〈팬 닉네임〉"처럼 풀어서 보여줌.
export const NAME_TOKEN = '{{name}}';

export function showNameToken(body: string, label: string): string {
  return body.split(NAME_TOKEN).join(`〈${label}〉`);
}
