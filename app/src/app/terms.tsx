import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 초안 — 정식 출시 전 반드시 변호사 검토 필요. 실제 서비스 동작(구독 정책, 비대칭 메시징,
// 모더레이션, 연령 정책)을 반영해서 초안을 잡아뒀을 뿐, 법적 효력을 가진 최종본이 아님.
const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. 서비스 개요',
    body:
      'Toffee(이하 "서비스")는 팬이 배우와 1:1 형태의 메시지를 주고받을 수 있는 구독형 서비스입니다. ' +
      '무료 이용권이나 체험판은 제공하지 않으며, 배우와의 메시지 열람·전송은 유료 구독 후에만 가능합니다.',
  },
  {
    title: '2. 구독 및 결제',
    body:
      '구독은 Apple App Store 또는 Google Play를 통한 인앱결제로만 이루어집니다. 구독은 별도로 해지하지 ' +
      '않는 한 자동으로 갱신되며, 해지는 이용 중인 스토어(App Store 또는 Google Play)의 계정 설정에서 ' +
      '직접 하실 수 있습니다. 환불 정책은 이용 중인 스토어의 정책을 따릅니다.',
  },
  {
    title: '3. 메시지 이용 정책',
    body:
      '팬은 텍스트와 이모지만 전송할 수 있으며, 사진·음성·영상은 배우만 전송할 수 있습니다. 배우가 올리는 ' +
      '스토리는 게시 후 24시간이 지나면 자동으로 사라지며, 구독자만 열람할 수 있습니다.',
  },
  {
    title: '4. 금지 행위 및 제재',
    body:
      '욕설, 음란한 표현 등 부적절한 내용이 포함된 메시지는 전송 자체가 차단될 수 있습니다. 이용약관을 ' +
      '위반한 회원은 서비스 이용이 일시적으로 정지되거나 영구적으로 제한될 수 있습니다.',
  },
  {
    title: '5. 만 14세 미만 이용자',
    body:
      '만 14세 미만 이용자는 법정대리인(부모 등)의 동의를 받아야 서비스를 이용할 수 있습니다. 법정대리인 ' +
      '동의가 완료되기 전까지는 구독 및 메시지 이용이 제한됩니다.',
  },
  {
    title: '6. 계정 관리',
    body:
      '회원은 본인의 계정 정보를 안전하게 관리할 책임이 있습니다. 서비스는 신고, 부정 이용 등이 확인될 경우 ' +
      '사전 통지 없이 계정 이용을 제한할 수 있습니다.',
  },
  {
    title: '7. 준거법',
    body: '이 약관은 대한민국 법률에 따라 해석됩니다.',
  },
];

export default function TermsScreen() {
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
