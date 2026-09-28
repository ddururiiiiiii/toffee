import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OnboardingLayout } from '@/components/onboarding-layout';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useSetBirthDate } from '@/hooks/use-onboarding';
import { ApiError } from '@/lib/api-client';
import { Spacing } from '@/constants/theme';

// 미성년자(국가별 기준, 서버 minor-age.ts)면 법정대리인 동의가 필요해서 물어보는 것 — 그 외 용도로는 안 씀
export default function BirthDateOnboardingScreen() {
  const { t } = useTranslation();
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [invalid, setInvalid] = useState(false);
  const setBirthDate = useSetBirthDate();
  const monthRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);
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

  // 숫자만, 칸이 차면 다음 칸으로
  const digits = (value: string) => value.replace(/\D/g, '');

  return (
    <OnboardingLayout
      step={2}
      title={t('onboarding.birthDateTitle')}
      subtitle={t('onboarding.birthDateHint')}
      footer={<Button title={t('onboarding.next')} loading={setBirthDate.isPending} disabled={!isValid} onPress={handleSubmit} />}>
      <View style={styles.row}>
        <TextField
          value={year}
          onChangeText={(v) => {
            setYear(digits(v));
            if (digits(v).length === 4) monthRef.current?.focus();
          }}
          placeholder="YYYY"
          keyboardType="number-pad"
          maxLength={4}
          containerStyle={styles.year}
          style={styles.center}
          accessibilityLabel="YYYY"
        />
        <TextField
          ref={monthRef}
          value={month}
          onChangeText={(v) => {
            setMonth(digits(v));
            if (digits(v).length === 2) dayRef.current?.focus();
          }}
          placeholder="MM"
          keyboardType="number-pad"
          maxLength={2}
          containerStyle={styles.part}
          style={styles.center}
          accessibilityLabel="MM"
        />
        <TextField
          ref={dayRef}
          value={day}
          onChangeText={(v) => setDay(digits(v))}
          placeholder="DD"
          keyboardType="number-pad"
          maxLength={2}
          containerStyle={styles.part}
          style={styles.center}
          accessibilityLabel="DD"
          onSubmitEditing={() => isValid && handleSubmit()}
        />
      </View>
      {invalid ? (
        <ThemedText type="small" themeColor="danger">
          {t('onboarding.birthDateInvalid')}
        </ThemedText>
      ) : null}
      {setBirthDate.isError ? (
        <ThemedText type="small" themeColor="danger">
          {setBirthDate.error instanceof ApiError ? setBirthDate.error.message : t('onboarding.saveFailed')}
        </ThemedText>
      ) : null}
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  year: { flex: 1.6 },
  part: { flex: 1 },
  center: { textAlign: 'center' },
});
