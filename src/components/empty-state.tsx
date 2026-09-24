import { StyleSheet, Text, View } from 'react-native';
import { makeStyles, spacing, type, useTheme } from '@/theme';

export function EmptyState({ title, body }: { title: string; body?: string }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[type.headline, { color: colors.label, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.subhead, styles.body]}>{body}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  body: { color: colors.secondaryLabel, textAlign: 'center' },
}));
