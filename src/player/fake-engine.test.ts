import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEngine } from './fake-engine.ts';

/** Loads a 1 s track and records what the engine reports. */
async function setup() {
  const engine = new FakeEngine();
  const seen: string[] = [];
  engine.on('ended', () => seen.push('ended'));
  engine.on('advanced', ({ key }) => seen.push(`advanced:${key}`));
  await engine.load('a', { title: 'A', durationMs: 1000 });
  // Driven by hand, not by the real interval.
  await engine.play();
  (engine as unknown as { stopTimer(): void }).stopTimer();
  return { engine, seen };
}

const steps = (engine: FakeEngine, n: number) => {
  for (let i = 0; i < n; i += 1) engine.tick();
};

test('with nothing armed, the end of a track is reported as ended', async () => {
  const { engine, seen } = await setup();
  steps(engine, 4);
  assert.deepEqual(seen, ['ended']);
  assert.equal(engine.getState(), 'ended');
});

test('an armed track follows without stopping, and is reported with its key', async () => {
  const { engine, seen } = await setup();
  await engine.setNext({ uri: 'b', meta: { title: 'B', durationMs: 5000 }, key: 'k1' });
  steps(engine, 4);
  assert.deepEqual(seen, ['advanced:k1']);
  assert.equal(engine.getState(), 'playing');
  assert.deepEqual(await engine.getPosition(), { positionMs: 0, durationMs: 5000 });
});

test('a crossfade moves on that much before the end', async () => {
  const { engine, seen } = await setup();
  await engine.setTransition({ crossfadeMs: 500, gapless: true });
  await engine.setNext({ uri: 'b', meta: { title: 'B' }, key: 'k' });
  steps(engine, 2);
  assert.deepEqual(seen, ['advanced:k']);
});

test('with gapless off and no crossfade, an armed track waits for the queue', async () => {
  const { engine, seen } = await setup();
  await engine.setTransition({ crossfadeMs: 0, gapless: false });
  await engine.setNext({ uri: 'b', meta: { title: 'B' }, key: 'k' });
  steps(engine, 4);
  assert.deepEqual(seen, ['ended']);
});

test('loading forgets what was armed', async () => {
  const { engine, seen } = await setup();
  await engine.setNext({ uri: 'b', meta: { title: 'B' }, key: 'k' });
  await engine.load('c', { title: 'C', durationMs: 500 }, { autoplay: true });
  (engine as unknown as { stopTimer(): void }).stopTimer();
  steps(engine, 2);
  assert.deepEqual(seen, ['ended']);
});

test('play after the end starts the track over', async () => {
  const { engine } = await setup();
  steps(engine, 4);
  await engine.play();
  (engine as unknown as { stopTimer(): void }).stopTimer();
  assert.equal((await engine.getPosition()).positionMs, 0);
});

test('an unplug says whether it stopped running music', async () => {
  const { engine } = await setup();
  const seen: { reason: string; wasPlaying?: boolean }[] = [];
  engine.on('routeChange', (e) => seen.push(e));
  await engine.simulateRouteChange('unplugged');
  await engine.simulateRouteChange('unplugged');
  assert.deepEqual(seen, [
    { reason: 'unplugged', wasPlaying: true },
    { reason: 'unplugged', wasPlaying: false },
  ]);
});
