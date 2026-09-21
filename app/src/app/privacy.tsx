import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 초안 — 정식 출시 전 반드시 변호사 검토 필요(태국 PDPA, 글로벌 이용자 고려한 GDPR 유사
// 조항 등). 실제로 수집·저장하는 항목을 기준으로 초안을 잡아뒀을 뿐, 최종본이 아님.
const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. 수집하는 개인정보',
    body:
      '소셜 로그인(Google/Apple/Naver/Kakao/LINE)을 통한 이름·이메일, 생년월일(연령 확인용), ' +
      '법정대리인 이메일(만 14세 미만인 경우), 구독·결제 내역(카드번호 등 결제수단 정보는 Apple/Google이 ' +
      '직접 처리하며 서비스는 저장하지 않음), 메시지 내용, 푸시 알림 발송을 위한 기기 토큰을 수집합니다.',
  },
  {
    title: '2. 이용 목적',
    body:
      '회원 식별 및 서비스 제공, 구독 결제 처리, 연령 확인 및 법정대리인 동의 절차 진행, 부적절한 이용 ' +
      '방지(신고 처리, 금칙어 필터링), 새 메시지·스토리 알림 발송에 이용합니다.',
  },
  {
    title: '3. 제3자 제공',
    body:
      '배우 소속사 담당자는 자신이 담당하는 배우에게 온 팬의 답장을 열람할 수 있습니다. 결제 정보는 ' +
      'Apple/Google에, 이메일 발송은 이메일 발송 대행사에 위탁됩니다. 그 외에는 법령에 따른 경우를 제외하고 ' +
      '제3자에게 개인정보를 제공하지 않습니다.',
  },
  {
    title: '4. 만 14세 미만 이용자의 개인정보',
    body:
      '만 14세 미만 이용자의 개인정보를 수집하기 전에는 법정대리인의 동의를 받습니다. 동의는 법정대리인 ' +
      '이메일로 발송된 확인 링크를 통해 이루어집니다.',
  },
  {
    title: '5. 보유 및 파기',
    body:
      '회원 탈퇴 시 관련 법령에서 별도로 보관을 요구하는 경우를 제외하고 지체 없이 개인정보를 파기합니다.',
  },
  {
    title: '6. 국외 이용자',
    body:
      '서비스는 태국을 비롯한 여러 국가의 이용자를 대상으로 합니다. 거주 국가의 개인정보 보호 법령에 따라 ' +
      '추가적인 권리(열람, 정정, 삭제 요청 등)가 인정될 수 있습니다.',
  },
];

export default function PrivacyScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={[styles.draftNotice, { backgroundColor: theme.tintSoft }]}>
          <ThemedText type="smallBold">이 문서는 초안입니다</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            정식 출시 전 반드시 변호사 검토를 거쳐야 하며, 지금은 법적 효력이 없습니다.
          </ThemedText>
        </ThemedView>

        {SECTIONS.map((section) => (
          <ThemedView key={section.title} style={styles.section}>
            <ThemedText type="smallBold">{section.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {section.body}
            </ThemedText>
          </ThemedView>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  draftNotice: { borderRadius: 12, padding: Spacing.three, gap: 4 },
  section: { gap: Spacing.two },
});
