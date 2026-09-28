import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { fontFor, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 입력창 — Cloud 배경, 위에 작은 라벨(선택), 아래 오류·도움말(선택) */
export const TextField = forwardRef<TextInput, TextInputProps & { label?: string; error?: string | null; hint?: string; containerStyle?: StyleProp<ViewStyle> }>(
  function TextField({ label, error, hint, containerStyle, style, ...rest }, ref) {
    const theme = useTheme();
    const { i18n } = useTranslation();
    return (
      <View style={[styles.wrap, containerStyle]}>
        {label ? (
          <ThemedText type="smallMedium" themeColor="textSecondary">
            {label}
          </ThemedText>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.textTertiary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : 'transparent' },
            fontFor(400, i18n.language),
            style,
          ]}
          {...rest}
        />
        {error ? (
          <ThemedText type="small" themeColor="danger">
            {error}
          </ThemedText>
        ) : hint ? (
          <ThemedText type="small" themeColor="textTertiary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: { height: 52, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16, borderWidth: 1.5, outlineStyle: 'none' } as object,
});
