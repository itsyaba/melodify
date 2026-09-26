import * as Font from 'expo-font';
import type { TextStyle } from 'react-native';
import { Outfit_400Regular } from '@expo-google-fonts/outfit/400Regular';
import { Outfit_500Medium } from '@expo-google-fonts/outfit/500Medium';
import { Outfit_600SemiBold } from '@expo-google-fonts/outfit/600SemiBold';
import { showOnboarding } from './state';

/**
 * Outfit, the welcome pages' typeface, bundled so it works offline (SIL Open Font License). It is
 * loaded before the pages show, so they never flash the system font first; if loading fails they
 * use the system font at the same weights.
 */

const FACES = { regular: 'Outfit_400Regular', medium: 'Outfit_500Medium', semibold: 'Outfit_600SemiBold' } as const;
const WEIGHTS = { regular: '400', medium: '500', semibold: '600' } as const;

let ready = false;

export async function loadOnboardingFonts(): Promise<void> {
  if (ready) return;
  try {
    await Font.loadAsync({
      [FACES.regular]: Outfit_400Regular,
      [FACES.medium]: Outfit_500Medium,
      [FACES.semibold]: Outfit_600SemiBold,
    });
    ready = true;
  } catch (err) {
    console.warn('[melodify] loading the welcome pages’ font failed:', err);
  }
}

/** The font for a weight: Outfit once loaded, else the system font at that weight. */
export function face(weight: keyof typeof FACES): TextStyle {
  return ready ? { fontFamily: FACES[weight] } : { fontWeight: WEIGHTS[weight] };
}

/** Settings' Welcome tour: the font first, then the pages. */
export async function openOnboarding(): Promise<void> {
  await loadOnboardingFonts();
  showOnboarding();
}
