import { Platform, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { CategoryRow, Section } from '@/components/settings-rows';
import { SymbolView } from '@/components/symbol';
import { countTracks } from '@/db/tracks';
import { useLibraryQuery } from '@/hooks/use-library-query';
import { engineInfo } from '@/player';
import { usePrefs, type Prefs } from '@/prefs';
import { openOnboarding } from '@/screens/onboarding/fonts';
import { monthPeriod, monthPeriodAround, previousPeriod, yearPeriod } from '@/screens/recap/period';
import { openRecap } from '@/screens/recap/state';
import { showMenu } from '@/components/menus';
import { ACCENTS, makeStyles, radius, SETTINGS_TILES, spacing, type, useTheme } from '@/theme';
import { formatCount } from '@/utils/format';

const THEME_LABELS: Record<Prefs['theme'], string> = { system: 'System', light: 'Light', dark: 'Dark', black: 'Black' };

function soundSummary(p: Prefs): string {
  const parts = [
    p.playbackRate !== 1 ? `${p.playbackRate}×` : null,
    p.pitchFollowsSpeed || p.pitchSemitones !== 0 ? 'pitch' : null,
    p.equalizer.enabled ? `EQ ${p.equalizer.name || 'custom'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Speed, pitch, equalizer';
}

/**
 * Settings › Your recap: the spans worth looking back on. This month is offered while it runs,
 * and the one just gone until the next is worth reading; the years are always there.
 */
function openRecapMenu(): void {
  const now = new Date();
  const thisMonth = monthPeriod(now);
  const lastMonth = previousPeriod(thisMonth);
  const soFar = monthPeriodAround(now).key === thisMonth.key;
  const thisYear = yearPeriod(now);
  showMenu({
    title: 'Your recap',
    message: 'How you listened, month by month and year by year',
    items: [
      { label: soFar ? thisMonth.label : `${thisMonth.label} so far`, icon: 'calendar', onPress: () => openRecap(thisMonth) },
      { label: lastMonth.label, icon: 'calendar', onPress: () => openRecap(lastMonth) },
      { label: `${thisYear.label} in music`, icon: 'star', onPress: () => openRecap(thisYear) },
      { label: `${previousPeriod(thisYear).label} in music`, icon: 'star', onPress: () => openRecap(previousPeriod(thisYear)) },
    ],
  });
}

/** The Settings root: a card for the app, then one row per page of settings. */
export function SettingsScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const router = useRouter();
  const prefs = usePrefs();
  const { data: count } = useLibraryQuery(countTracks);
  const songs = count == null ? '' : formatCount(count, 'song');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: colors.tint }]}>
          <SymbolView name="music.note" size={28} tintColor={colors.onTint} />
        </View>
        <View style={styles.heroText}>
          <Text style={[type.title, { color: colors.label }]}>Melodify</Text>
          <Text numberOfLines={1} style={[type.footnote, { color: colors.secondaryLabel }]}>
            {[`Version ${Constants.expoConfig?.version ?? '?'}`, songs].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {engineInfo.kind !== 'native' ? (
        <View style={styles.warning}>
          <SymbolView name="exclamationmark.triangle.fill" size={18} tintColor={colors.destructive} />
          <Text style={[type.footnote, { color: colors.label, flex: 1 }]}>
            This build has no audio engine, so nothing will play. Install a newer {Platform.OS === 'android' ? 'APK' : 'IPA'}.
          </Text>
        </View>
      ) : null}

      <Section>
        <CategoryRow
          icon="folder.fill"
          color={SETTINGS_TILES.library}
          title="Library"
          subtitle={songs ? `${songs}, scanning, hidden songs` : 'Scanning, hidden songs'}
          onPress={() => router.push('/settings/library')}
        />
        <CategoryRow
          icon="paintbrush.fill"
          color={SETTINGS_TILES.appearance}
          title="Appearance"
          subtitle={`${THEME_LABELS[prefs.theme]} · ${ACCENTS[prefs.accent].label}`}
          onPress={() => router.push('/settings/appearance')}
        />
        <CategoryRow
          icon="play.fill"
          color={SETTINGS_TILES.playback}
          title="Playback"
          subtitle="Crossfade, gapless, headphones"
          onPress={() => router.push('/settings/playback')}
        />
        <CategoryRow
          icon="slider.vertical.3"
          color={SETTINGS_TILES.sound}
          title="Sound"
          subtitle={soundSummary(prefs)}
          onPress={() => router.push('/sound')}
        />
      </Section>

      <Section>
        <CategoryRow
          icon="externaldrive.fill"
          color={SETTINGS_TILES.backup}
          title="Backup and restore"
          subtitle="Playlists, queues, play counts"
          onPress={() => router.push('/settings/backup')}
        />
        <CategoryRow
          icon="chart.bar.fill"
          color={SETTINGS_TILES.recap}
          title="Your recap"
          subtitle="This month and this year in music"
          onPress={openRecapMenu}
        />
        <CategoryRow
          icon="sparkles"
          color={SETTINGS_TILES.tour}
          title="Welcome tour"
          subtitle="What Melodify does"
          onPress={() => void openOnboarding()}
        />
        <CategoryRow
          icon="info.circle.fill"
          color={SETTINGS_TILES.about}
          title="About"
          subtitle="Version, audio engine, storage"
          onPress={() => router.push('/settings/about')}
        />
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.secondaryBackground,
  },
  logo: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, gap: 2 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
  },
}));
