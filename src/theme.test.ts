import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// React Native resolves a PlatformColor name it does not have in its own table to clear, silently:
// PlatformColor('white') once made every button label on an accent fill invisible. This keeps
// each iOS color name the theme uses to one React Native knows.
test('every iOS color name in the theme is one React Native can resolve', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const table = readFileSync(
    path.join(root, 'node_modules/react-native/ReactCommon/react/renderer/graphics/platform/ios/react/renderer/graphics/RCTPlatformColorUtils.mm'),
    'utf8',
  );
  const known = new Set([...table.matchAll(/@"(\w+)" : @\{/g)].map((m) => m[1]));
  const theme = readFileSync(path.join(root, 'src/theme.ts'), 'utf8');
  const used = new Set([...theme.matchAll(/ios(?:\('|: ')(\w+)'/g)].map((m) => m[1]));
  assert.ok(used.size > 10, 'found the names the theme uses');
  assert.deepEqual([...used].filter((n) => !known.has(n)), []);
});
