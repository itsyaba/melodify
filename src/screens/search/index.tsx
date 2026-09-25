import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '@/theme';
import { ActiveSearch } from './active';
import { Browse } from './browse';

/**
 * The Search tab, Spotify style: a browse page with a big search field, and a search mode once
 * the field is tapped. It draws its own header (the stack's is off), so it pads by the status bar
 * itself: the lists below then start under it, and only their bottom is inset for the tab bar.
 * `?focus=1` (the home screen's Search shortcut) opens straight into search mode.
 */
export function SearchScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [searching, setSearching] = useState(focus === '1');
  useEffect(() => {
    if (focus === '1') setSearching(true);
  }, [focus]);
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {searching ? <ActiveSearch onCancel={() => setSearching(false)} /> : <Browse onSearch={() => setSearching(true)} />}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
}));
