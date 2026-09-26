import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayerBar } from '@/components/mini-player';
import { useCurrentTrack } from '@/player/queue-store';
import { usePrefs, type TabKey } from '@/prefs';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type MaterialName = keyof typeof MaterialIcons.glyphMap;

/** Each tab's icon, by route name: Android's own, rather than the SF Symbols the tabs use on iOS. */
const ICONS: Record<string, MaterialName> = {
  '(home)': 'home',
  '(queue)': 'queue-music',
  '(folders)': 'folder',
  '(library)': 'library-music',
  '(search)': 'search',
};

/**
 * Android's tab bar: the mini player docked above a Material 3 navigation bar, whose selected tab
 * wears a pill in the accent. iOS keeps its native tab bar, with the mini player in the bar's
 * bottom accessory; Android has no such slot, so both are drawn here.
 */
export function AndroidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const styles = useStyles();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const current = useCurrentTrack();
  const { tabs } = usePrefs();
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      {current ? (
        <View style={styles.player}>
          <MiniPlayerBar />
        </View>
      ) : null}
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // Tabs switched off in Settings stay declared (see the layout) but have no place here.
          if (!tabs.includes(route.name.replace(/[()]/g, '') as TabKey)) return null;
          const focused = state.index === index;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              style={styles.tab}
            >
              <View style={[styles.pill, focused && styles.pillOn]}>
                <MaterialIcons name={ICONS[route.name] ?? 'circle'} size={24} color={focused ? colors.tint : colors.secondaryLabel} />
              </View>
              <Text numberOfLines={1} style={[styles.label, { color: focused ? colors.label : colors.secondaryLabel }, focused && styles.labelOn]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  player: {
    height: 58,
    marginHorizontal: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.secondaryBackground,
  },
  bar: { flexDirection: 'row', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.fill },
  label: { fontSize: 12, fontWeight: '500' },
  labelOn: { fontWeight: '700' },
}));
