import { LegalDocument } from '@/components/legal-document';

// 이용약관(초안) — 본문은 서버(backend/src/legal/legal-texts.ts)가 원본, 공개 웹페이지 /legal/terms와 같은 글
export default function TermsScreen() {
  return <LegalDocument doc="terms" />;
}
