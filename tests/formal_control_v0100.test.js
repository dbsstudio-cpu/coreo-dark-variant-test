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

test('v0.10.0 digital direction press emits immediately without swipe thresholds', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.10.0');

  const up = control.startDirection({ x: 0, y: -1 }, 1, 100);
  assert.equal(up.source, 'digital-dpad-down');
  assert.deepEqual({ ...up.direction }, { x: 0, y: -1 });
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: -1 });

  assert.equal(control.changeDirection({ x: 0, y: -1 }, 110), null);
  assert.equal(control.getCommandsAfter(0).length, 1);
});

test('v0.10.0 sliding onto another key changes direction once and release stops', () => {
  const control = loadControl();
  control.startDirection({ x: 0, y: -1 }, 8, 200);
  const right = control.changeDirection({ x: 1, y: 0 }, 216);
  const down = control.changeDirection({ x: 0, y: 1 }, 232);
  const stop = control.stop('pointerup', 248);

  assert.equal(right.source, 'digital-dpad-slide');
  assert.deepEqual({ ...right.direction }, { x: 1, y: 0 });
  assert.deepEqual({ ...down.direction }, { x: 0, y: 1 });
  assert.equal(stop.type, 'stop');
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
  assert.deepEqual(Array.from(control.getCommandsAfter(0), (command) => command.id), [1, 2, 3, 4]);
});

test('v0.10.0 keeps precision corner and hide-pocket assistance', () => {
  const assist = loadRailAssist();
  const maze = [
    [0, 0, 0, 0],
    [0, 1, 6, 0],
    [0, 1, 1, 0]
  ];
  const cell = { x: 1, y: 1 };

  assert.equal(assist.VERSION, 'v0.10.0');
  assert.equal(assist.cornerGrace(maze, cell, { x: 1, y: 0 }), 18);
  assert.equal(assist.cornerGrace(maze, cell, { x: 0, y: 1 }), 14);
  assert.equal(assist.entrySpeedScale(maze, cell, { x: 1, y: 0 }), 0.86);
});

test('formal UI and cache are synchronized to v0.10.0 digital D-pad', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const control = fs.readFileSync(path.join(root, 'js', 'control.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

  assert.match(index, /COREO DARK v0\.10\.0/);
  assert.equal((index.match(/data-dpad-direction=/g) || []).length, 4);
  assert.match(index, /aria-label="向上移動"/);
  assert.match(index, /aria-label="向下移動"/);
  assert.match(control, /digital-dpad-down/);
  assert.match(control, /digital-dpad-slide/);
  assert.doesNotMatch(control, /TURN_THRESHOLD|REVERSE_THRESHOLD|AXIS_BIAS|accumulatedDX/);
  assert.match(main, /document\.body\.classList\.add\('game-started'\)/);
  assert.match(css, /body\.game-started \.digital-dpad/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(serviceWorker, /coreo-dark-variant-v0100-digital-dpad-20260719/);
});
