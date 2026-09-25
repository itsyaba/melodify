import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Chips } from '@/components/chips';
import { ListRow } from '@/components/list-row';
import { confirm, promptText } from '@/components/menus';
import { Section, ToggleRow } from '@/components/settings-rows';
import { Slider } from '@/components/slider';
import { toast } from '@/components/toast';
import { EQ_LABELS, EQ_PRESETS, presetMatching } from '@/player/eq-presets';
import { effectivePitch, previewSound } from '@/player/sound';
import { setPref, usePrefs, type EqualizerPrefs } from '@/prefs';
import { makeStyles, spacing, type, useTheme } from '@/theme';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const BAND_HEIGHT = 170;

function speedLabel(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

function semitoneLabel(semitones: number): string {
  const rounded = Math.round(semitones * 10) / 10;
  if (rounded === 0) return 'Original pitch';
  const n = Math.abs(rounded);
  return `${rounded > 0 ? '+' : '−'}${n} semitone${n === 1 ? '' : 's'}`;
}

function dbLabel(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  return rounded === 0 ? '0' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}`;
}

/**
 * Speed, pitch and the equalizer. Sliders are heard while they are dragged (`previewSound`) and
 * saved when let go, so the engine follows every step without a database write per step.
 */
export function SoundScreen() {
  const styles = useStyles();
  const colors = useTheme();
  const prefs = usePrefs();
  // What a slider is being dragged to, until it is let go and the preference catches up.
  const [rate, setRate] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [eqDraft, setEqDraft] = useState<EqualizerPrefs | null>(null);
  const [dragging, setDragging] = useState(false);

  const shownRate = rate ?? prefs.playbackRate;
  const shownPitch = pitch ?? prefs.pitchSemitones;
  const eq = eqDraft ?? prefs.equalizer;
  const custom = prefs.eqPresets;
  const presetName = eq.name || presetMatching(eq.gains, eq.preampDb, custom)?.name || '';
  const presetOptions = [...EQ_PRESETS, ...custom].map((p) => ({ key: p.name, label: p.name }));
  if (!presetName) presetOptions.push({ key: '', label: 'Custom' });

  const release = () => setDragging(false);
  const saveEq = (next: EqualizerPrefs) => {
    setEqDraft(null);
    release();
    setPref('equalizer', next);
  };
  const dragEq = (next: EqualizerPrefs) => {
    setEqDraft(next);
    previewSound({ equalizer: next });
  };

  const choosePreset = (name: string) => {
    const preset = [...EQ_PRESETS, ...custom].find((p) => p.name === name);
    if (!preset) return;
    setPref('equalizer', { ...prefs.equalizer, enabled: true, name: preset.name, gains: [...preset.gains], preampDb: preset.preampDb });
  };

  const savePreset = async () => {
    const name = await promptText('Save preset', { message: 'Saves the bands and the pre-amp.', ok: 'Save' });
    if (!name) return;
    if (EQ_PRESETS.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast.show('A built-in preset already has that name');
      return;
    }
    const preset = { name, gains: [...eq.gains], preampDb: eq.preampDb };
    setPref('eqPresets', [...custom.filter((p) => p.name !== name), preset]);
    setPref('equalizer', { ...eq, name });
    toast.show(`Saved ${name}`);
  };

  const deletePreset = async (name: string) => {
    if (!(await confirm(`Delete the preset “${name}”?`, 'The equalizer keeps its current bands.', 'Delete'))) return;
    setPref('eqPresets', custom.filter((p) => p.name !== name));
    if (prefs.equalizer.name === name) setPref('equalizer', { ...prefs.equalizer, name: '' });
  };

  return (
    <ScrollView style={styles.root} scrollEnabled={!dragging} contentContainerStyle={styles.content}>
      <Section title="Speed">
        <View style={styles.block}>
          <Text style={[type.title, styles.value]}>{speedLabel(shownRate)}</Text>
          <Slider
            value={shownRate}
            min={0.5}
            max={2}
            step={0.05}
            origin={1}
            accessibilityLabel="Speed"
            formatValue={speedLabel}
            onDragStart={() => setDragging(true)}
            onChange={(v) => {
              setRate(v);
              previewSound({ playbackRate: v });
            }}
            onCommit={(v) => {
              setRate(null);
              release();
              setPref('playbackRate', v);
            }}
          />
        </View>
        <Chips
          options={SPEEDS.map((s) => ({ key: s, label: speedLabel(s) }))}
          value={SPEEDS.includes(prefs.playbackRate) ? prefs.playbackRate : -1}
          onChange={(v) => setPref('playbackRate', v)}
        />
      </Section>

      <Section title="Pitch">
        <View style={styles.block}>
          <Text style={[type.headline, styles.value]}>
            {prefs.pitchFollowsSpeed ? `${semitoneLabel(effectivePitch({ ...prefs, playbackRate: shownRate }))}, with the speed` : semitoneLabel(shownPitch)}
          </Text>
          <Slider
            value={shownPitch}
            min={-12}
            max={12}
            step={1}
            origin={0}
            disabled={prefs.pitchFollowsSpeed}
            accessibilityLabel="Pitch"
            formatValue={semitoneLabel}
            onDragStart={() => setDragging(true)}
            onChange={(v) => {
              setPitch(v);
              previewSound({ pitchSemitones: v });
            }}
            onCommit={(v) => {
              setPitch(null);
              release();
              setPref('pitchSemitones', v);
            }}
          />
        </View>
        <ToggleRow title="Pitch follows speed" value={prefs.pitchFollowsSpeed} onChange={(v) => setPref('pitchFollowsSpeed', v)} />
        {shownRate !== 1 || shownPitch !== 0 ? (
          <ListRow
            title="Back to normal speed and pitch"
            tinted
            trailing={null}
            onPress={() => {
              setPref('playbackRate', 1);
              setPref('pitchSemitones', 0);
            }}
          />
        ) : null}
      </Section>

      <Section
        title="Equalizer"
        footer="Boosting bands can clip loud songs. Lower the pre-amp by about as much as the biggest boost to make room."
      >
        <ToggleRow title="Equalizer" value={prefs.equalizer.enabled} onChange={(v) => setPref('equalizer', { ...prefs.equalizer, enabled: v })} />
        <Chips
          options={presetOptions}
          value={presetName}
          onChange={choosePreset}
          onLongPress={(name) => {
            if (custom.some((p) => p.name === name)) void deletePreset(name);
          }}
        />
        <View style={[styles.bands, !eq.enabled && styles.off]}>
          {eq.gains.map((gain, i) => (
            <View key={EQ_LABELS[i]} style={styles.band}>
              <Text style={[type.caption, styles.dim]}>{dbLabel(gain)}</Text>
              <Slider
                vertical
                length={BAND_HEIGHT}
                value={gain}
                min={-12}
                max={12}
                step={0.5}
                origin={0}
                accessibilityLabel={`${EQ_LABELS[i]} hertz`}
                formatValue={(v) => `${dbLabel(v)} decibels`}
                onDragStart={() => setDragging(true)}
                onChange={(v) => dragEq({ ...eq, enabled: true, name: '', gains: eq.gains.map((g, j) => (j === i ? v : g)) })}
                onCommit={(v) => saveEq({ ...eq, enabled: true, name: '', gains: eq.gains.map((g, j) => (j === i ? v : g)) })}
              />
              <Text style={[type.caption, styles.dim]}>{EQ_LABELS[i]}</Text>
            </View>
          ))}
        </View>
        <View style={styles.block}>
          <View style={styles.labelRow}>
            <Text style={[type.body, { color: colors.label }]}>Pre-amp</Text>
            <Text style={[type.body, styles.dim]}>{dbLabel(eq.preampDb)} dB</Text>
          </View>
          <Slider
            value={eq.preampDb}
            min={-12}
            max={12}
            step={0.5}
            origin={0}
            accessibilityLabel="Pre-amp"
            formatValue={(v) => `${dbLabel(v)} decibels`}
            onDragStart={() => setDragging(true)}
            onChange={(v) => dragEq({ ...eq, name: '', preampDb: v })}
            onCommit={(v) => saveEq({ ...eq, name: '', preampDb: v })}
          />
          <View style={styles.labelRow}>
            <Text style={[type.body, { color: colors.label }]}>Bass boost</Text>
            <Text style={[type.body, styles.dim]}>{Math.round(eq.bassBoost * 100)}%</Text>
          </View>
          <Slider
            value={eq.bassBoost}
            min={0}
            max={1}
            step={0.05}
            accessibilityLabel="Bass boost"
            formatValue={(v) => `${Math.round(v * 100)} percent`}
            onDragStart={() => setDragging(true)}
            onChange={(v) => dragEq({ ...eq, enabled: true, bassBoost: v })}
            onCommit={(v) => saveEq({ ...eq, enabled: true, bassBoost: v })}
          />
        </View>
        <ListRow title="Save as a preset…" tinted trailing={null} onPress={() => void savePreset()} />
        {custom.some((p) => p.name === presetName) ? (
          <ListRow title={`Delete “${presetName}”`} tinted trailing={null} onPress={() => void deletePreset(presetName)} />
        ) : null}
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xxl },
  block: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  value: { color: colors.label, textAlign: 'center' },
  dim: { color: colors.secondaryLabel },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  bands: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  band: { alignItems: 'center', gap: spacing.xs },
  off: { opacity: 0.5 },
}));
