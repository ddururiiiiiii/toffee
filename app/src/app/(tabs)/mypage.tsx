import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, CreditCard, FileText, Globe, LifeBuoy, LogOut, ShieldCheck, Sparkles } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { ListRow } from '@/components/ui/list-row';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { confirm } from '@/lib/confirm';
import { ApiError } from '@/lib/api-client';
import { SUPPORT_EMAIL } from '@/lib/env';
import { openSupportMail } from '@/lib/support';
import { openStoreSubscriptions } from '@/lib/store-links';
import { useMySubscriptions } from '@/hooks/use-subscriptions';
import { useDeleteAccount, useMe } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGE_NATIVE_NAMES } from '@/i18n/languages';
import { useLocalePreference } from '@/i18n/locale-preference-context';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';

/**
 * Profile — DESIGN_GUIDE §10: 단순한 설정 목록. 구독 카드는 여기 늘어놓지 않고 "구독 관리"로 들어감(§11).
 * 구독 관리 · 알림 · 언어 · 결제 수단(스토어) · 고객센터 · 약관·개인정보 · 로그아웃, 맨 아래 회원 탈퇴.
 */
export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { logout } = useAuth();
  const { data: me } = useMe();
  const { data: subscriptions } = useMySubscriptions();
  const { override } = useLocalePreference();
  const deleteAccount = useDeleteAccount();
  const [notice, setNotice] = useState<string | null>(null);

  const availableAt = me?.nicknameChangeAvailableAt ? new Date(me.nicknameChangeAvailableAt) : null;
  const locked = !!availableAt && availableAt > new Date();

  const openSupport = () => {
    setNotice(null);
    openSupportMail(me?.id).catch(() => setNotice(t('support.openFailed', { email: SUPPORT_EMAIL })));
  };

  // 회원 탈퇴 — 되돌릴 수 없고, 스토어 구독은 앱이 끊을 수 없어서 스토어에서 먼저 해지하라고 안내(애플 가이드라인 5.1.1)
  const startDelete = async () => {
    const ok = await confirm(t('deleteAccount.title'), t('deleteAccount.body'), t('deleteAccount.confirm'), t('common.cancel'));
    if (!ok) return;
    setNotice(null);
    deleteAccount.mutate(undefined, {
      onSuccess: () => void logout(),
      onError: (e) => setNotice(e instanceof ApiError ? e.message : t('deleteAccount.failed')),
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="display" style={styles.title}>
          {t('profile.title')}
        </ThemedText>

        <View style={[styles.me, { backgroundColor: theme.backgroundElement }]}>
          <Avatar name={me?.nickname ?? '?'} size={56} />
          <View style={styles.meBody}>
            <ThemedText type="headline" numberOfLines={1}>
              {me?.nickname ?? t('profile.noNickname')}
            </ThemedText>
            {locked && availableAt ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('nickname.nextChange', { date: availableAt.toLocaleDateString(i18n.language) })}
              </ThemedText>
            ) : (
              <Pressable onPress={() => router.push('/settings/nickname')} hitSlop={8} accessibilityRole="button">
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  {t('profile.editNickname')}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </View>

        <Section label={t('profile.account')}>
          <ListRow
            icon={Sparkles}
            title={t('profile.manageSubscriptions')}
            value={subscriptions ? t('profile.subscriptionCount', { count: subscriptions.length }) : undefined}
            onPress={() => router.push('/subscriptions')}
          />
          <ListRow icon={Bell} title={t('profile.notifications')} onPress={() => router.push('/settings/notifications')} />
          <ListRow
            icon={Globe}
            title={t('profile.language')}
            value={override ? LANGUAGE_NATIVE_NAMES[override] : t('profile.languageSystem')}
            onPress={() => router.push('/settings/language')}
          />
          <ListRow icon={CreditCard} title={t('profile.paymentMethod')} subtitle={t('profile.paymentMethodHint')} onPress={() => void openStoreSubscriptions().catch(() => {})} />
        </Section>

        <Section label={t('profile.support')}>
          <ListRow
            icon={LifeBuoy}
            title={t('profile.help')}
            subtitle={SUPPORT_EMAIL ? undefined : t('support.notReady')}
            onPress={SUPPORT_EMAIL ? openSupport : undefined}
          />
          <ListRow icon={FileText} title={t('profile.terms')} onPress={() => router.push('/terms')} />
          <ListRow icon={ShieldCheck} title={t('profile.privacy')} onPress={() => router.push('/privacy')} />
        </Section>

        <Section>
          <ListRow icon={LogOut} title={t('profile.logout')} onPress={() => void logout()} showChevron={false} />
        </Section>

        {notice ? (
          <ThemedText type="small" themeColor="danger" style={styles.center}>
            {notice}
          </ThemedText>
        ) : null}
        <Button title={t('deleteAccount.title')} variant="ghost" size="md" onPress={startDelete} loading={deleteAccount.isPending} style={styles.delete} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {label ? (
        <ThemedText type="captionBold" themeColor="textTertiary" style={styles.sectionLabel}>
          {label.toUpperCase()}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: Spacing.five, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  title: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  me: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  meBody: { flex: 1, gap: 2 },
  section: { marginTop: Spacing.four },
  sectionLabel: { paddingHorizontal: Spacing.four, marginBottom: Spacing.one, letterSpacing: 0.6 },
  center: { textAlign: 'center', marginTop: Spacing.three },
  delete: { alignSelf: 'center', marginTop: Spacing.three },
});
