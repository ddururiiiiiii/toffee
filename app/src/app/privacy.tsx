import { LegalDocument } from '@/components/legal-document';

// 개인정보처리방침(초안) — 본문은 서버(backend/src/legal/legal-texts.ts)가 원본, 공개 웹페이지 /legal/privacy와 같은 글
export default function PrivacyScreen() {
  return <LegalDocument doc="privacy" />;
}
