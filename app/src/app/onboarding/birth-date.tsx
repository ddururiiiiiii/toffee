import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSetBirthDate } from '@/hooks/use-onboarding';
import { ApiError } from '@/lib/api-client';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 만 14세 미만이면 법정대리인 동의가 필요해서 물어보는 것 — 그 외 용도로는 안 씀
export default function BirthDateOnboardingScreen() {
  const theme = useTheme();
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const setBirthDate = useSetBirthDate();

  const isValid = year.length === 4 && month.length >= 1 && day.length >= 1;

  const handleSubmit = () => {
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    setBirthDate.mutate(iso);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          생년월일을 알려주세요
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          만 14세 미만이면 법정대리인(부모님) 동의를 먼저 받아야 서비스를 이용할 수 있어요.
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
            <ThemedText style={styles.buttonText}>다음</ThemedText>
          )}
        </Pressable>
        {setBirthDate.isError && (
          <ThemedText themeColor="danger" type="small">
            {setBirthDate.error instanceof ApiError ? setBirthDate.error.message : '저장하지 못했어요.'}
          </ThemedText>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: -Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, width: 64, textAlign: 'center' },
  yearInput: { width: 90 },
  button: { borderRadius: 10, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
