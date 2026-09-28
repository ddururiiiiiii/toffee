import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Search, X } from 'lucide-react-native';

import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { fontFor, Radius, Spacing } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/use-theme';

/** 검색창 — Cloud 배경, 왼쪽 돋보기, 입력하면 오른쪽 지우기 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  clearLabel,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  clearLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { i18n } = useTranslation();
  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement }, style]}>
      <Icon as={Search} size={18} themeColor="textSecondary" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        style={[styles.input, { color: theme.text }, fontFor(400, i18n.language)]}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value ? <IconButton icon={X} size={16} label={clearLabel} onPress={() => onChangeText('')} style={styles.clear} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: Radius.md, paddingLeft: Spacing.three, gap: Spacing.two },
  input: { flex: 1, height: 44, fontSize: 15, outlineStyle: 'none' } as object,
  clear: { width: 36, height: 36 },
});
