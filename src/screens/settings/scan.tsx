import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { scanLibrary } from '@/scan/scanner';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { libraryEvents, type ScanProgress } from '@/utils/events';

export function ScanScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const db = useSQLiteContext();
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const running = progress != null && progress.phase !== 'done' && progress.phase !== 'error';

  useEffect(() => libraryEvents.on('scanProgress', setProgress), []);

  return (
    <View style={styles.root}>
      <Pressable
        disabled={running}
        onPress={() => void scanLibrary(db)}
        style={({ pressed }) => [styles.button, (pressed || running) && { opacity: 0.6 }]}
      >
        {running ? <ActivityIndicator color={colors.onTint} /> : <Text style={[type.headline, styles.buttonText]}>Scan now</Text>}
      </Pressable>
      {progress ? (
        <View style={styles.stats}>
          <Line label="Phase" value={progress.phase} />
          <Line label="Files seen" value={String(progress.seen)} />
          <Line label="Added" value={String(progress.added)} />
          <Line label="Updated" value={String(progress.updated)} />
          <Line label="Removed" value={String(progress.removed)} />
          <Line label="Tags read" value={String(progress.tagged)} />
          {progress.tagFailed > 0 ? <Line label="Unreadable tags" value={String(progress.tagFailed)} /> : null}
          {progress.message ? <Text style={[type.footnote, { color: colors.destructive }]}>{progress.message}</Text> : null}
        </View>
      ) : (
        <Text style={[type.subhead, { color: colors.secondaryLabel, textAlign: 'center' }]}>
          Scanning walks the Melodify folder, adds new files and drops missing ones, then reads the tags and artwork of anything new or changed.
        </Text>
      )}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <View style={styles.line}>
      <Text style={[type.body, { color: colors.secondaryLabel }]}>{label}</Text>
      <Text style={[type.body, { color: colors.label }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.xl },
  button: { backgroundColor: colors.tint, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: colors.onTint },
  stats: { gap: spacing.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
}));
