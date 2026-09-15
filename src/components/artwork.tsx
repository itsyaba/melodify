import { Image, StyleSheet, View } from 'react-native';
import { Paths } from 'expo-file-system';
import { colors, radius } from '@/theme';

interface Props {
  /** Relative path inside Documents/ (folder art) or a cache key (Phase 1). */
  artKey: string | null;
  size: number;
  rounded?: keyof typeof radius;
}

export function artUri(artKey: string | null): string | null {
  if (!artKey) return null;
  return Paths.join(Paths.document, artKey);
}

export function Artwork({ artKey, size, rounded = 'sm' }: Props) {
  const uri = artUri(artKey);
  const box = { width: size, height: size, borderRadius: radius[rounded] };
  if (!uri) return <View style={[styles.placeholder, box]} />;
  return <Image source={{ uri }} style={box} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.fill },
});
