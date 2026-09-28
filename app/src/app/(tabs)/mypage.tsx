import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useMySubscriptions, useUnsubscribe, type Subscription } from '@/hooks/use-subscriptions';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n/languages';
import { useLocalePreference } from '@/i18n/locale-preference-context';
import { NicknameForm } from '@/components/nickname-form';
import { confirm } from '@/lib/confirm';
import { useDeleteAccount, useMe } from '@/hooks/use-onboarding';
import { SupportLink } from '@/components/support-link';
import { ApiError } from '@/lib/api-client';

function SubscriptionRow({ subscription }: { subscription: Subscription }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const unsubscribe = useUnsubscribe(subscription.actorId);

  // lib/confirm — 웹에선 Alert 버튼이 동작하지 않아 예전엔 웹에서 해지 버튼이 아무 반응이 없었음
  const confirmUnsubscribe = async () => {
    const ok = await confirm(
      t('mypage.unsubscribeTitle'),
      t('mypage.unsubscribeConfirm', { name: subscription.actor.chatDisplayName }),
      t('mypage.unsubscribe'),
      t('common.cancel'),
    );
    if (ok) unsubscribe.mutate();
  };

  return (
    <ThemedView style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Image
        source={{ uri: subscription.actor.chatProfileImageUrl ?? undefined }}
        style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]}
      />
      <ThemedView style={styles.rowBody}>
        <ThemedText type="smallBold">{subscription.actor.chatDisplayName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('price.perMonth', { price: (subscription.actor.monthlyPriceCents / 100).toFixed(0) })} ·{' '}
          {t('mypage.since', { date: new Date(subscription.startedAt).toLocaleDateString(i18n.language) })}
        </ThemedText>
      </ThemedView>
      <Pressable onPress={confirmUnsubscribe} disabled={unsubscribe.isPending} style={styles.unsubscribeButton}>
        <ThemedText type="small" themeColor="danger">
          {t('mypage.unsubscribe')}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

// 언어 선택 — "기기 언어 따르기"(기본) 또는 직접 고정. 언어 이름은 항상 그 언어 자신의 표기로.
function LanguagePicker() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { override, setOverride } = useLocalePreference();
  const options: { value: SupportedLanguage | null; label: string }[] = [
    { value: null, label: t('mypage.languageSystem') },
    ...SUPPORTED_LANGUAGES.map((language) => ({ value: language, label: LANGUAGE_NATIVE_NAMES[language] })),
  ];

  return (
    <ThemedView style={styles.languageSection}>
      <ThemedText type="smallBold">{t('mypage.language')}</ThemedText>
      <ThemedView style={styles.languageOptions}>
        {options.map((option) => {
          const selected = override === option.value;
          return (
            <Pressable
              key={option.value ?? 'system'}
              onPress={() => setOverride(option.value)}
              style={[styles.languageChip, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
              <ThemedText type="small" style={selected ? styles.languageChipTextSelected : undefined}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ThemedView>
    </ThemedView>
  );
}

// 닉네임 보기/바꾸기 — 7일에 한 번이라 바꿀 수 없는 기간엔 다음 가능 날짜만 보여줌
function NicknameSection() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const availableAt = me?.nicknameChangeAvailableAt ? new Date(me.nicknameChangeAvailableAt) : null;
  const locked = !!availableAt && availableAt > new Date();

  return (
    <ThemedView style={styles.languageSection}>
      <ThemedText type="smallBold">{t('nickname.label')}</ThemedText>
      {editing ? (
        <NicknameForm initial={me?.nickname} onSaved={() => setEditing(false)} />
      ) : (
        <ThemedView style={styles.nicknameRow}>
          <ThemedText>{me?.nickname ?? '-'}</ThemedText>
          {locked ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('nickname.nextChange', { date: availableAt.toLocaleDateString(i18n.language) })}
            </ThemedText>
          ) : (
            <Pressable onPress={() => setEditing(true)} hitSlop={8}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                {t('nickname.change')}
              </ThemedText>
            </Pressable>
          )}
        </ThemedView>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {t('nickname.rule')}
      </ThemedText>
    </ThemedView>
  );
}

// 회원 탈퇴 — 되돌릴 수 없고, 스토어 구독은 앱이 끊을 수 없어서 스토어에서 먼저 해지하라고 안내(애플 가이드라인 5.1.1)
function DeleteAccountSection() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const deleteAccount = useDeleteAccount();
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const ok = await confirm(t('deleteAccount.title'), t('deleteAccount.body'), t('deleteAccount.confirm'), t('common.cancel'));
    if (!ok) return;
    setError(null);
    deleteAccount.mutate(undefined, {
      onSuccess: () => void logout(),
      onError: (e) => setError(e instanceof ApiError ? e.message : t('deleteAccount.failed')),
    });
  };

  return (
    <ThemedView style={styles.deleteSection}>
      <Pressable onPress={start} disabled={deleteAccount.isPending} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.deleteText}>
          {t('deleteAccount.title')}
        </ThemedText>
      </Pressable>
      {error && (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      )}
    </ThemedView>
  );
}

export default function MyPageScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data: subscriptions, isLoading } = useMySubscriptions();

  // 항목이 늘어서 전체를 스크롤로(예전엔 고정 배치라 작은 화면에서 아래가 잘릴 수 있었음). 구독 목록은 몇 개뿐이라 map
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="title" style={styles.title}>
          {t('mypage.title')}
        </ThemedText>

        <ThemedText type="smallBold" style={styles.sectionLabel}>
          {t('mypage.subscriptions')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionHint}>
          {t('mypage.subscriptionsHint')}
        </ThemedText>

        {isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.tint} />
        ) : (
          <ThemedView style={styles.list}>
            {subscriptions?.length ? (
              subscriptions.map((item) => <SubscriptionRow key={item.id} subscription={item} />)
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyMessage}>
                {t('mypage.empty')}
              </ThemedText>
            )}
          </ThemedView>
        )}

        <NicknameSection />
        <LanguagePicker />

        <ThemedView style={styles.legalLinks}>
          <Pressable onPress={() => router.push('/terms')}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('screens.terms')}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => router.push('/privacy')}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('screens.privacy')}
            </ThemedText>
          </Pressable>
        </ThemedView>
        <ThemedView style={styles.supportRow}>
          <SupportLink />
        </ThemedView>

        <Pressable onPress={logout} style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold" themeColor="danger">
            {t('common.logout')}
          </ThemedText>
        </Pressable>
        <DeleteAccountSection />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: Spacing.five },
  supportRow: { paddingHorizontal: Spacing.four, marginTop: Spacing.three, backgroundColor: 'transparent' },
  deleteSection: { alignItems: 'center', gap: 4, backgroundColor: 'transparent' },
  deleteText: { textDecorationLine: 'underline' },
  languageSection: { paddingHorizontal: Spacing.four, gap: Spacing.two, marginTop: Spacing.two, backgroundColor: 'transparent' },
  nicknameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, backgroundColor: 'transparent' },
  languageOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, backgroundColor: 'transparent' },
  languageChip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  languageChipTextSelected: { color: '#fff' },
  legalLinks: { flexDirection: 'row', gap: Spacing.four, paddingHorizontal: Spacing.four, marginTop: Spacing.two, backgroundColor: 'transparent' },
  title: { fontSize: 32, lineHeight: 40, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  sectionLabel: { paddingHorizontal: Spacing.four, marginTop: Spacing.four },
  sectionHint: { paddingHorizontal: Spacing.four, marginTop: 2 },
  list: { padding: Spacing.four, gap: Spacing.three, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  rowBody: { flex: 1, gap: 2 },
  unsubscribeButton: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  emptyMessage: { textAlign: 'center', marginTop: Spacing.four },
  loading: { marginTop: Spacing.four },
  logoutButton: {
    margin: Spacing.four,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
