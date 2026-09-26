import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { makeStyles, radius, spacing, type, useTheme } from '@/theme';
import { setPromptHost, type PromptRequest } from './menus';

/**
 * The text prompt on Android, where React Native has no Alert.prompt: a dialog with the question,
 * a field holding the current name selected, and Cancel / OK. Mounted once at the root; every
 * `promptText` call opens it. Back, or a tap outside, cancels.
 */
export function PromptHost() {
  const styles = useStyles();
  const colors = useTheme();
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [text, setText] = useState('');
  const pending = useRef<PromptRequest | null>(null);

  useEffect(() => {
    setPromptHost((next) => {
      // A second prompt while one is open (rare) cancels the first rather than losing it.
      pending.current?.resolve(null);
      pending.current = next;
      setText(next.defaultValue ?? '');
      setRequest(next);
    });
    return () => setPromptHost(null);
  }, []);

  const answer = (value: string | null) => {
    const current = pending.current;
    pending.current = null;
    setRequest(null);
    current?.resolve(value === null ? null : value.trim());
  };

  return (
    <Modal visible={request !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => answer(null)}>
      <KeyboardAvoidingView behavior="height" style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={() => answer(null)} accessibilityLabel="Cancel" />
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text style={[type.title, styles.title]}>{request?.title}</Text>
          {request?.message ? <Text style={[type.subhead, styles.message]}>{request.message}</Text> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            selectTextOnFocus
            selectionColor={colors.tint}
            cursorColor={colors.tint}
            returnKeyType="done"
            onSubmitEditing={() => answer(text)}
            style={[type.body, styles.input]}
          />
          <View style={styles.buttons}>
            <Pressable onPress={() => answer(null)} style={styles.button} accessibilityRole="button">
              <Text style={[type.headline, { color: colors.tint }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => answer(text)} style={styles.button} accessibilityRole="button">
              <Text style={[type.headline, { color: colors.tint }]}>{request?.ok ?? 'OK'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  scrim: { backgroundColor: colors.scrim },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg + 8,
    backgroundColor: colors.sheet,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: { color: colors.label },
  message: { color: colors.secondaryLabel },
  input: {
    color: colors.label,
    borderBottomWidth: 2,
    borderBottomColor: colors.tint,
    paddingVertical: spacing.sm,
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  button: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
}));
