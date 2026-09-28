import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSetBirthDate } from '@/hooks/use-onboarding';
import { ApiError } from '@/lib/api-client';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 미성년자(국가별 기준, 서버 minor-age.ts)면 법정대리인 동의가 필요해서 물어보는 것 — 그 외 용도로는 안 씀
export default function BirthDateOnboardingScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const setBirthDate = useSetBirthDate();

  const [invalid, setInvalid] = useState(false);
  const isValid = year.length === 4 && month.length >= 1 && day.length >= 1;

  // 달력에 없는 날짜·미래 날짜는 보내기 전에 걸러서 바로 알려줌(서버도 한 번 더 검사)
  const handleSubmit = () => {
    const [y, m, d] = [Number(year), Number(month), Number(day)];
    const date = new Date(Date.UTC(y, m - 1, d));
    const real = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    if (!real || y < 1900 || date.getTime() > Date.now()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBirthDate.mutate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          {t('onboarding.birthDateTitle')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          {t('onboarding.birthDateHint')}
        </ThemedText>

        <ThemedView style={styles.row}>
          <TextInput
            value={year}
            onChangeText={setYear}
            placeholder="YYYY"
            keyboardType="number-pad"
            maxLength={4}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.yearInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={month}
            onChangeText={setMonth}
            placeholder="MM"
            keyboardType="number-pad"
            maxLength={2}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <TextInput
            value={day}
            onChangeText={setDay}
            placeholder="DD"
            keyboardType="number-pad"
            maxLength={2}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
        </ThemedView>

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid || setBirthDate.isPending}
          style={[styles.button, { backgroundColor: theme.tint, opacity: isValid ? 1 : 0.5 }]}>
          {setBirthDate.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>{t('onboarding.next')}</ThemedText>
          )}
        </Pressable>
        {invalid && (
          <ThemedText themeColor="danger" type="small">
            {t('onboarding.birthDateInvalid')}
          </ThemedText>
        )}
        {setBirthDate.isError && (
          <ThemedText themeColor="danger" type="small">
            {setBirthDate.error instanceof ApiError ? setBirthDate.error.message : t('onboarding.saveFailed')}
          </ThemedText>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  title: { textAlign: 'center', fontSize: 28, lineHeight: 36 },
  subtitle: { textAlign: 'center', marginTop: -Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, width: 64, textAlign: 'center' },
  yearInput: { width: 90 },
  button: { borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
