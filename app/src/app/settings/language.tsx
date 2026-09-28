import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n/languages';
import { useLocalePreference } from '@/i18n/locale-preference-context';
import { MaxContentWidth, Spacing } from '@/constants/theme';

/** 언어 — "기기 언어 따르기"(기본) 또는 직접 고정. 언어 이름은 항상 그 언어 자신의 표기로 */
export default function LanguageScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { override, setOverride } = useLocalePreference();
  const options: { value: SupportedLanguage | null; label: string }[] = [
    { value: null, label: t('profile.languageSystem') },
    ...SUPPORTED_LANGUAGES.map((language) => ({ value: language, label: LANGUAGE_NATIVE_NAMES[language] })),
  ];
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.scroll}>
      {options.map((option) => (
        <ListRow
          key={option.value ?? 'system'}
          title={option.label}
          onPress={() => setOverride(option.value)}
          showChevron={false}
          trailing={override === option.value ? <Icon as={Check} size={20} color={theme.tint} /> : undefined}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
