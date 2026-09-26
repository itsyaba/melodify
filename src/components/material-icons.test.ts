import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { allMaterialIcons, materialIcon } from './material-icons';

const require = createRequire(import.meta.url);
const glyphs: Record<string, number> = JSON.parse(
  readFileSync(require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json'), 'utf8'),
);

test('every Material icon the table names is in the font', () => {
  const missing = allMaterialIcons().filter((name) => !(name in glyphs));
  assert.deepEqual(missing, []);
});

test('filled and outlined SF Symbols stay apart', () => {
  assert.notEqual(materialIcon('heart'), materialIcon('heart.fill'));
  assert.notEqual(materialIcon('bookmark'), materialIcon('bookmark.fill'));
});

test('numbered skip glyphs where the font has them, the plain one elsewhere', () => {
  assert.equal(materialIcon('gobackward.10'), 'replay-10');
  assert.equal(materialIcon('goforward.30'), 'forward-30');
  assert.equal(materialIcon('gobackward.15'), 'replay');
  assert.equal(materialIcon('no.such.symbol'), null);
});
