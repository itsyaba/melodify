import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '@/theme';

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={[type.headline, { color: colors.label, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.subhead, styles.body]}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  body: { color: colors.secondaryLabel, textAlign: 'center' },
});
