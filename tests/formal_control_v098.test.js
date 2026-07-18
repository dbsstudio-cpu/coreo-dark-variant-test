const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadControl() {
  const filename = path.join(__dirname, '..', 'js', 'control.js');
  const source = `${fs.readFileSync(filename, 'utf8')}\n;globalThis.__control = ControlLogic;`;
  const context = {
    console,
    performance: { now: () => 1000 },
    window: { innerWidth: 390 },
    document: { documentElement: { style: { setProperty() {} } } }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  return context.__control;
}

test('v0.9.8 ignores thumb jitter and accepts a deliberate cross-axis swipe', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.9.8');
  control.start(100, 100, 1, 100);

  assert.equal(control.move(100, 88, 116), null);
  const up = control.move(100, 87, 132);
  assert.deepEqual({ ...up.direction }, { x: 0, y: -1 });

  assert.equal(control.move(108, 85, 148), null);
  assert.equal(control.move(111, 87, 164), null);
  const right = control.move(114, 87, 180);
  assert.deepEqual({ ...right.direction }, { x: 1, y: 0 });
  assert.deepEqual({ ...control.getVector() }, { x: 1, y: 0 });
});

test('v0.9.8 requires a deliberate reverse stroke and release still stops immediately', () => {
  const control = loadControl();
  control.start(50, 50, 7, 200);
  control.move(63, 50, 216);

  assert.equal(control.move(53, 51, 232), null);
  const left = control.move(52, 51, 248);
  assert.deepEqual({ ...left.direction }, { x: -1, y: 0 });

  const stop = control.stop('pointerup', 264);
  assert.equal(stop.type, 'stop');
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
  assert.deepEqual(Array.from(control.getCommandsAfter(0), (command) => command.id), [1, 2, 3]);
});

test('formal page, rail movement and cache are synchronized to v0.9.8', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

  assert.match(index, /COREO DARK v0\.9\.8/);
  assert.match(main, /const RAIL_BACK_WINDOW = 8/);
  assert.match(main, /const TURN_BUFFER_MS = 550/);
  assert.match(main, /expireQueuedDirection\(now\)/);
  assert.match(main, /applyControlDirection\(command\.direction, command\.timestamp\)/);
  assert.match(serviceWorker, /coreo-dark-variant-v098-control-20260719/);
});
