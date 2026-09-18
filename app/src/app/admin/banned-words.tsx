import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useBannedWords,
  useCreateBannedWord,
  useDeleteBannedWord,
  type BannedWord,
} from '@/hooks/use-admin';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

const LANGUAGES: { key: BannedWord['language']; label: string }[] = [
  { key: 'ko', label: '한국어' },
  { key: 'th', label: '태국어' },
  { key: 'en', label: '영어' },
];

function AddForm() {
  const theme = useTheme();
  const [term, setTerm] = useState('');
  const [language, setLanguage] = useState<BannedWord['language']>('ko');
  const create = useCreateBannedWord();

  const handleAdd = () => {
    if (!term.trim()) return;
    create.mutate({ term: term.trim(), language }, { onSuccess: () => setTerm('') });
  };

  return (
    <ThemedView style={[styles.addForm, { backgroundColor: theme.backgroundElement }]}>
      <ThemedView style={styles.languageRow}>
        {LANGUAGES.map((lang) => (
          <Pressable
            key={lang.key}
            onPress={() => setLanguage(lang.key)}
            style={[styles.languageChip, language === lang.key && { backgroundColor: theme.tint }]}>
            <ThemedText type="small" style={language === lang.key ? styles.languageChipTextActive : undefined}>
              {lang.label}
            </ThemedText>
          </Pressable>
        ))}
      </ThemedView>
      <TextInput
        value={term}
        onChangeText={setTerm}
        placeholder="추가할 금칙어"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
      />
      <Pressable
        disabled={!term.trim() || create.isPending}
        onPress={handleAdd}
        style={[styles.addButton, { backgroundColor: theme.tint, opacity: term.trim() ? 1 : 0.5 }]}>
        <ThemedText style={styles.addButtonText}>추가</ThemedText>
      </Pressable>
      {create.isError && (
        <ThemedText type="small" themeColor="danger">
          {(create.error as Error).message}
        </ThemedText>
      )}
    </ThemedView>
  );
}

function BannedWordRow({ word }: { word: BannedWord }) {
  const theme = useTheme();
  const remove = useDeleteBannedWord();
  const languageLabel = LANGUAGES.find((lang) => lang.key === word.language)?.label ?? word.language;

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <ThemedView style={styles.rowBody}>
        <ThemedText type="smallBold">{word.term}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {languageLabel}
        </ThemedText>
      </ThemedView>
      <Pressable disabled={remove.isPending} onPress={() => remove.mutate(word.id)}>
        <ThemedText type="small" themeColor="danger">
          삭제
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export default function AdminBannedWordsScreen() {
  const theme = useTheme();
  const { data: words, isLoading } = useBannedWords();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AddForm />
      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={theme.tint} />
      ) : (
        <FlatList
          data={words}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
              등록된 금칙어가 없어요.
            </ThemedText>
          }
          renderItem={({ item }) => <BannedWordRow word={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addForm: { margin: Spacing.four, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  languageRow: { flexDirection: 'row', gap: Spacing.two },
  languageChip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 8 },
  languageChipTextActive: { color: '#fff' },
  input: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  addButton: { borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: Spacing.three },
  rowBody: { gap: 2 },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.six },
  loading: { marginTop: Spacing.six },
});
