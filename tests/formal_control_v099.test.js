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
    window: { innerWidth: 390 },
    document: { documentElement: { style: { setProperty() {} } } }
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

test('v0.9.9 keeps deliberate segmented swipes and immediate release stop', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.9.9');
  control.start(100, 100, 1, 100);

  assert.equal(control.move(100, 88, 116), null);
  const up = control.move(100, 87, 132);
  assert.deepEqual({ ...up.direction }, { x: 0, y: -1 });

  assert.equal(control.move(108, 85, 148), null);
  assert.equal(control.move(111, 87, 164), null);
  const right = control.move(114, 87, 180);
  assert.deepEqual({ ...right.direction }, { x: 1, y: 0 });

  const stop = control.stop('pointerup', 196);
  assert.equal(stop.type, 'stop');
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
});

test('v0.9.9 gives hide-pocket entrances more corner capture than normal turns', () => {
  const assist = loadRailAssist();
  const maze = [
    [0, 0, 0, 0],
    [0, 1, 6, 0],
    [0, 1, 1, 0]
  ];
  const cell = { x: 1, y: 1 };

  assert.equal(assist.VERSION, 'v0.9.9');
  assert.equal(assist.cornerGrace(maze, cell, { x: 1, y: 0 }), 18);
  assert.equal(assist.cornerGrace(maze, cell, { x: 0, y: 1 }), 14);
  assert.equal(assist.entrySpeedScale(maze, cell, { x: 1, y: 0 }), 0.86);
  assert.equal(assist.entrySpeedScale(maze, cell, { x: 0, y: 1 }), 1);
});

test('v0.9.9 turn buffer is short-lived in both time and travelled distance', () => {
  const assist = loadRailAssist();
  const queue = { timestamp: 100, origin: { x: 25, y: 25 } };

  assert.equal(assist.queueExpired(queue, { x: 25, y: 120 }, 800), false);
  assert.equal(assist.queueExpired(queue, { x: 25, y: 126 }, 800), true);
  assert.equal(assist.queueExpired(queue, { x: 25, y: 25 }, 851), true);
});

test('formal page, movement integration and cache are synchronized to v0.9.9', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

  assert.match(index, /COREO DARK v0\.9\.9/);
  assert.match(index, /js\/rail-assist\.js/);
  assert.match(main, /RailAssist\.cornerGrace/);
  assert.match(main, /RailAssist\.entrySpeedScale/);
  assert.match(main, /RailAssist\.queueExpired/);
  assert.match(serviceWorker, /coreo-dark-variant-v099-precision-turn-20260719/);
  assert.match(serviceWorker, /js\/rail-assist\.js/);
});
