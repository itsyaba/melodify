import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[type.headline, { color: colors.label, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.subhead, styles.body]}>{body}</Text> : null}
      {action ? (
        <Pressable onPress={action.onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
          <Text style={[type.headline, { color: colors.onTint }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  body: { color: colors.secondaryLabel, textAlign: 'center' },
  action: {
    marginTop: spacing.md,
    backgroundColor: colors.tint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
}));
