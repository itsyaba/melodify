import { StyleSheet, View } from 'react-native';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { artSize, makeStyles, radius, useTheme } from '@/theme';

/** An SF Symbol in an artwork-sized tile, for rows that have no art: folders, "New playlist". */
export function IconTile({ name, size = artSize.row }: { name: SFSymbol; size?: number }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <SymbolView name={name} size={size * 0.45} tintColor={colors.tint} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  tile: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.fill },
}));
