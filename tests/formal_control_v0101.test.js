const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScript(filename, exportName) {
  const source = `${fs.readFileSync(filename, 'utf8')}\n;globalThis.__exported = ${exportName};`;
  const context = {
    console,
    performance: { now: () => 1000 },
    window: {},
    document: {}
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  return context.__exported;
}

function loadControl() {
  return loadScript(path.join(__dirname, '..', 'js', 'control.js'), 'ControlLogic');
}

function loadRailAssist() {
  return loadScript(path.join(__dirname, '..', 'js', 'rail-assist.js'), 'RailAssist');
}

test('v0.10.1 emits one direction per deliberate swipe and keeps moving after release', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.10.1');
  control.start(100, 100, 1);

  assert.equal(control.move(112, 100, 110), null);
  const right = control.move(118, 100, 120);
  assert.equal(right.source, 'discrete-swipe');
  assert.deepEqual({ ...right.direction }, { x: 1, y: 0 });
  assert.equal(control.move(150, 100, 130), null);
  assert.equal(control.finish('pointerup', 140), null);
  assert.deepEqual({ ...control.getVector() }, { x: 1, y: 0 });
  assert.equal(control.getCommandsAfter(0).length, 1);
});

test('v0.10.1 next swipe changes direction and a tap stops', () => {
  const control = loadControl();
  control.start(50, 50, 2);
  control.move(50, 31, 200);
  control.finish('pointerup', 210);

  control.start(80, 80, 3);
  const down = control.move(80, 99, 220);
  control.finish('pointerup', 230);
  assert.deepEqual({ ...down.direction }, { x: 0, y: 1 });

  control.start(90, 90, 4);
  const stop = control.finish('pointerup', 240);
  assert.equal(stop.type, 'stop');
  assert.equal(stop.source, 'tap-stop');
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
  assert.deepEqual(Array.from(control.getCommandsAfter(0), (command) => command.id), [1, 2, 3]);
});

test('v0.10.1 ignores ambiguous short diagonals and stops safely on cancellation', () => {
  const control = loadControl();
  control.start(100, 100, 5);
  assert.equal(control.move(119, 118, 300), null);
  const direction = control.move(128, 123, 310);
  assert.deepEqual({ ...direction.direction }, { x: 1, y: 0 });
  const stop = control.finish('pointercancel', 320);
  assert.equal(stop.type, 'stop');
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
});

test('v0.10.1 keeps precision corner and hide-pocket assistance', () => {
  const assist = loadRailAssist();
  const maze = [
    [0, 0, 0, 0],
    [0, 1, 6, 0],
    [0, 1, 1, 0]
  ];
  const cell = { x: 1, y: 1 };

  assert.equal(assist.VERSION, 'v0.10.1');
  assert.equal(assist.cornerGrace(maze, cell, { x: 1, y: 0 }), 18);
  assert.equal(assist.entrySpeedScale(maze, cell, { x: 1, y: 0 }), 0.86);
});

test('formal UI and cache are synchronized to v0.10.1 invisible swipe control', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const control = fs.readFileSync(path.join(root, 'js', 'control.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

  assert.match(index, /COREO DARK v0\.10\.1/);
  assert.match(index, /滑動轉向 · 輕點停止/);
  assert.doesNotMatch(index, /data-dpad-direction|digital-dpad|向上移動/);
  assert.match(control, /discrete-swipe/);
  assert.match(control, /tap-stop/);
  assert.doesNotMatch(control, /digital-dpad-down|digital-dpad-slide/);
  assert.match(css, /Invisible Discrete Swipe Control/);
  assert.doesNotMatch(css, /\.dpad-key|\.digital-dpad/);
  assert.match(serviceWorker, /coreo-dark-variant-v0101-discrete-swipe-20260719/);
});
