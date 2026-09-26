import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView as NativeSymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { FALLBACK_ICON, materialIcon } from './material-icons';

type MaterialName = keyof typeof MaterialIcons.glyphMap;

const warned = new Set<string>();

/**
 * An SF Symbol on iOS; its Material Icons counterpart on Android (see ./material-icons). Every
 * icon in the app goes through here, named the SF Symbol way, so screens need no platform checks.
 * On Android the glyph sits in a box of the symbol's size, as the SF Symbol does.
 */
export function SymbolView(props: SymbolViewProps) {
  if (Platform.OS !== 'android') return <NativeSymbolView {...props} />;
  const sf = typeof props.name === 'string' ? props.name : (props.name.ios ?? '');
  let name = materialIcon(sf);
  if (!name) {
    if (__DEV__ && !warned.has(sf)) {
      warned.add(sf);
      console.warn(`[melodify] no Material icon for the SF Symbol "${sf}"; add one to material-icons.ts`);
    }
    name = FALLBACK_ICON;
  }
  const size = props.size ?? 24;
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, props.style as StyleProp<ViewStyle>]}>
      <MaterialIcons name={name as MaterialName} size={size} color={(props.tintColor as ColorValue | undefined) ?? '#888888'} />
    </View>
  );
}

export type { SFSymbol } from 'expo-symbols';
