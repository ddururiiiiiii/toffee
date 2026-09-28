import { type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, TextInput, type TextInputProps } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

// 운영자 화면 공용 조각 — 운영자 화면은 한국어 전용(다국어 대상 아님)

export function AdminSection({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
      {children}
    </ThemedView>
  );
}

export function AdminField({ label, ...input }: { label: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...input}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
      />
    </ThemedView>
  );
}

export function AdminChip({
  label,
  selected,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = danger ? theme.danger : theme.tint;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? color : theme.backgroundSelected, backgroundColor: selected ? color : 'transparent' },
        disabled && styles.disabled,
      ]}>
      <ThemedText type="small" style={selected ? styles.chipSelectedText : danger ? { color: theme.danger } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function AdminButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: theme.tint }, disabled && styles.disabled]}>
      <ThemedText type="smallBold" style={styles.chipSelectedText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function AdminMessage({ text, error }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return (
    <ThemedText type="small" themeColor={error ? 'danger' : 'textSecondary'}>
      {text}
    </ThemedText>
  );
}

/** 정사각 썸네일 — 사진이 없으면 이름 첫 글자(기본 이모지 대신) */
export function AdminAvatar({ uri, name, size = 48 }: { uri: string | null; name: string; size?: number }) {
  const theme = useTheme();
  const box = { width: size, height: size, borderRadius: size / 4 };
  if (uri) return <Image source={{ uri }} style={[box, { backgroundColor: theme.backgroundSelected }]} />;
  return (
    <ThemedView style={[box, styles.avatarFallback, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">{name.trim().charAt(0)}</ThemedText>
    </ThemedView>
  );
}

/** 사진 한 장 고르기 — 프로필은 정사각으로 자르게 함. 취소하면 null */
export async function pickSquarePhoto(): Promise<{ uri: string; contentType?: string } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, contentType: asset.mimeType } : null;
}

export function formatBaht(cents: number) {
  return `฿${(cents / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
}

/** "129" / "129.50" → 12900 / 12950, 잘못된 입력이면 null */
export function parseBahtToCents(text: string): number | null {
  const trimmed = text.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

const styles = StyleSheet.create({
  section: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  field: { gap: 4, backgroundColor: 'transparent' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 6 },
  chipSelectedText: { color: '#fff' },
  button: { borderRadius: 10, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
});
