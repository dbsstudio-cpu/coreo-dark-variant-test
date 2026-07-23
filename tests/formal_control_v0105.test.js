const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScript(relativePath, globalName) {
  const filename = path.join(__dirname, '..', relativePath);
  const source = `${fs.readFileSync(filename, 'utf8')}\n;globalThis.__value = ${globalName};`;
  const context = {
    console,
    performance: { now: () => 0 },
    window: {},
    document: {}
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  return context.__value;
}

function loadControl() {
  return loadScript(path.join('js', 'control.js'), 'ControlLogic');
}

function loadRailAssist() {
  return loadScript(path.join('js', 'rail-assist.js'), 'RailAssist');
}

function directionCommands(control) {
  return Array.from(control.getCommandsAfter(0))
    .filter((command) => command.type === 'direction')
    .map((command) => ({ ...command.direction }));
}

function intentCommands(control) {
  return Array.from(control.getCommandsAfter(0))
    .filter((command) => command.type === 'turn-intent');
}

test('T1: v0.10.5 uses a fixed time window and has no event-count decay', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.10.5');
  assert.equal(control.INPUT_WINDOW_MS, 64);
  assert.equal(control.AXIS_DECAY, undefined);
  assert.equal(control.CONTROL_TARGETED_TURN_V0105, true);
});

test('T2: one held pointer emits intent before one confirmed cross-axis turn', () => {
  const control = loadControl();
  control.start(100, 100, 1, 0);
  control.move(100, 89, 16);
  control.move(105, 86, 32);
  control.move(111, 84, 48);

  assert.deepEqual(directionCommands(control), [
    { x: 0, y: -1 },
    { x: 1, y: 0 }
  ]);
  const intents = intentCommands(control);
  assert.equal(intents.length, 1);
  assert.deepEqual({ ...intents[0].direction }, { x: 1, y: 0 });
  const confirmed = control.getCommandsAfter(0).find((command) => command.source === 'window-confirmed');
  assert.equal(confirmed.intentCommandId, intents[0].id);
});

test('T3: identical geometry gives the same direction across event splits', () => {
  function replay(splitCount) {
    const control = loadControl();
    control.start(100, 100, 2, 0);
    control.move(100, 89, 16);
    for (let index = 1; index <= splitCount; index += 1) {
      const ratio = index / splitCount;
      control.move(100 + 16 * ratio, 89 - 4 * ratio, 16 + 64 * ratio);
    }
    return {
      directions: directionCommands(control),
      intents: intentCommands(control).map((command) => ({ ...command.direction }))
    };
  }

  for (const splitCount of [1, 2, 4, 8]) {
    assert.deepEqual(replay(splitCount), {
      directions: [{ x: 0, y: -1 }, { x: 1, y: 0 }],
      intents: [{ x: 1, y: 0 }]
    });
  }
});

test('T4: same-axis reverse is immediate and clears an earlier turn intent', () => {
  const control = loadControl();
  control.start(50, 50, 3, 0);
  control.move(50, 39, 16);
  control.move(55, 36, 32);
  assert.equal(intentCommands(control).length, 1);
  control.move(55, 51, 48);

  assert.deepEqual(directionCommands(control), [
    { x: 0, y: -1 },
    { x: 0, y: 1 }
  ]);
  assert.equal(control.turnIntent, null);
});

test('T5: straight movement with minor drift never oscillates axes', () => {
  const control = loadControl();
  control.start(100, 100, 4, 0);
  control.move(100, 89, 16);
  const drift = [[102, 81], [99, 73], [102, 65], [99, 57], [101, 49]];
  drift.forEach(([x, y], index) => control.move(x, y, 32 + index * 16));
  assert.deepEqual(directionCommands(control), [{ x: 0, y: -1 }]);
});

test('T6: pointer end clears samples and intent and emits stop', () => {
  const control = loadControl();
  control.start(100, 100, 5, 0);
  control.move(100, 89, 16);
  control.move(105, 86, 32);
  assert.ok(control.turnIntent);
  const stop = control.stop('pointercancel', 40);
  assert.equal(stop.type, 'stop');
  assert.equal(stop.source, 'pointercancel');
  assert.equal(control.samples.length, 0);
  assert.equal(control.turnIntent, null);
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
});

test('T7: coalesced samples are consumed without duplicating the outer event', () => {
  const control = loadControl();
  control.start(100, 100, 6, 0);
  control.ingestPointerEvent({
    clientX: 100,
    clientY: 89,
    timeStamp: 16,
    getCoalescedEvents: () => [
      { clientX: 100, clientY: 96, timeStamp: 8 },
      { clientX: 100, clientY: 89, timeStamp: 16 }
    ]
  });
  assert.deepEqual(directionCommands(control), [{ x: 0, y: -1 }]);
  assert.equal(control.samples.length, 1);
});

test('T8: target lookup binds the nearest legal cell and never mutates to the next cell', () => {
  const rail = loadRailAssist();
  const maze = [
    [0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0]
  ];
  const target = rail.findNearestLegalTurnAhead({
    maze,
    position: { x: 75, y: 75 },
    railDirection: { x: 1, y: 0 },
    desiredDirection: { x: 0, y: 1 },
    cellSize: 50,
    maxDistance: 75
  });
  assert.deepEqual({ ...target.cell }, { x: 2, y: 1 });
  assert.deepEqual({ ...target.center }, { x: 125, y: 75 });

  const queue = {
    createdAt: 0,
    targetCell: { ...target.cell },
    targetCenter: { ...target.center },
    targetAxis: target.axis,
    targetGrace: target.grace,
    approachDirection: { x: 1, y: 0 }
  };
  assert.equal(rail.queueExpired(queue, { x: 144, y: 75 }, 100), true);
  assert.deepEqual(queue.targetCell, { x: 2, y: 1 });
});

test('T9: a target expires by space first and by age as a safety cap', () => {
  const rail = loadRailAssist();
  const queue = {
    createdAt: 0,
    targetCenter: { x: 125, y: 75 },
    targetAxis: 'x',
    targetGrace: 18,
    approachDirection: { x: 1, y: 0 }
  };
  assert.equal(rail.queueExpired(queue, { x: 142, y: 75 }, 300), false);
  assert.equal(rail.queueExpired(queue, { x: 144, y: 75 }, 300), true);
  assert.equal(rail.queueExpired(queue, { x: 100, y: 75 }, 351), true);
});

test('T10: formal code uses target-bound turns and has no arbitrary queued direction', () => {
  const root = path.join(__dirname, '..');
  const control = fs.readFileSync(path.join(root, 'js', 'control.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const rail = fs.readFileSync(path.join(root, 'js', 'rail-assist.js'), 'utf8');
  assert.doesNotMatch(control, /AXIS_DECAY/);
  assert.match(control, /emitCommand\('turn-intent'/);
  assert.match(main, /targetCell/);
  assert.match(main, /state: 'INTENT'/);
  assert.match(main, /queuedTurn\.state === 'CONFIRMED'/);
  assert.match(main, /RailAssist\.sameCell\(cell, queuedTurn\.targetCell\)/);
  assert.doesNotMatch(main, /queuedDirection/);
  assert.match(main, /deferredControlCommand/);
  assert.match(main, /ControlLogic\.stop\?\.\('visibilitychange'\)/);
  assert.match(main, /ControlLogic\.stop\?\.\('pagehide'\)/);
  assert.match(rail, /TARGET_TURN_MAX_AGE_MS: 350/);
});

test('T11: formal UI exposes CoreZax v0.10.9 with Stage 03 9x48 and full-screen controls', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(index, /CoreZax v0\.10\.9/);
  assert.match(index, /<title>CoreZax - v0\.10\.9<\/title>/);
  assert.match(index, /id="btn-stage-3"/);
  assert.doesNotMatch(index, /stage03-direct-entry|stage03-lab\.html/);
  assert.match(index, /aria-label="連續滑動移動區"/);
  assert.doesNotMatch(index, /swipe-control-hint|digital-dpad|data-dpad-direction/);
  assert.match(css, /#joystick-zone\s*\{[\s\S]*?inset:\s*0;/);
  assert.doesNotMatch(css, /stage03-direct-entry/);
  assert.match(serviceWorker, /corezax-v0109-siphon-pressure-20260723/);
  assert.match(serviceWorker, /assets\/enemy_siphon\.png/);
  assert.doesNotMatch(serviceWorker, /stage03-lab/);
});

test('T12: player and camera rendering are stable without changing v0.10.5 control', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const camera = fs.readFileSync(path.join(root, 'js', 'camera.js'), 'utf8');
  assert.match(css, /#player\.actor\s*\{[\s\S]*?transition:\s*none;/);
  assert.match(css, /#player \.actor-sprite\s*\{[\s\S]*?will-change:\s*transform, filter;/);
  assert.match(main, /CameraLogic\.update\(playerPos\.y, dt\)/);
  assert.match(camera, /1 - Math\.pow\(1 - 0\.16, safeDelta \/ 16\.66\)/);
  assert.match(camera, /Math\.round\(this\.currentY \* pixelRatio\) \/ pixelRatio/);
});

test('T13: Stage 01 entry glow is not paint-clipped and Stage 02 owns stronger circuit waves', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
  assert.match(css, /#world\.stage-01,\s*#world\.stage-02\s*\{\s*contain:\s*layout style;\s*overflow:\s*visible;/);
  assert.match(css, /#world\.stage-02\.circuit-pulse \.cell\.path::after\s*\{[\s\S]*?rgba\(229, 243, 255, 0\.9\)[\s\S]*?rgba\(47, 99, 255, 0\.48\)/);
  assert.match(css, /#world\.stage-02\.circuit-pulse \.cell\.path\.pulse-wave-5::after\s*\{\s*animation-name:\s*circuit-wave-s2-5;/);
  assert.match(css, /@keyframes circuit-wave-s2-5\s*\{[\s\S]*?74%\{opacity:\.82\}[\s\S]*?78%\{opacity:\.18\}/);
});
