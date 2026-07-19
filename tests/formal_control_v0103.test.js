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
    window: {},
    document: {}
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  return context.__control;
}

function plainDirection(command) {
  return command ? { ...command.direction } : null;
}

test('T1: one held touch continuously emits up, right, down and left', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.10.3');
  control.start(100, 100, 1);

  const up = control.move(100, 87, 100);
  const right = control.move(113, 87, 116);
  const down = control.move(113, 100, 132);
  const left = control.move(100, 100, 148);

  assert.deepEqual([up, right, down, left].map(plainDirection), [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ]);
  assert.deepEqual(Array.from(control.getCommandsAfter(0), (command) => command.id), [1, 2, 3, 4]);
});

test('T2: same-axis reverse uses the lower threshold immediately', () => {
  const control = loadControl();
  control.start(50, 50, 2);
  const up = control.move(50, 37, 200);
  const down = control.move(50, 48, 216);

  assert.deepEqual(plainDirection(up), { x: 0, y: -1 });
  assert.deepEqual(plainDirection(down), { x: 0, y: 1 });
});

test('T3/T5: micro jitter and minor diagonal drift do not emit a new direction', () => {
  const control = loadControl();
  control.start(100, 100, 3);
  assert.equal(control.move(105, 96, 300), null);
  assert.equal(control.move(100, 101, 316), null);
  assert.equal(control.getCommandsAfter(0).length, 0);

  const up = control.move(104, 88, 332);
  assert.deepEqual(plainDirection(up), { x: 0, y: -1 });
  assert.equal(control.move(109, 80, 348), null);
  assert.equal(control.getCommandsAfter(0).length, 1);
});

test('T4: releasing the held touch always emits stop and clears movement', () => {
  const control = loadControl();
  control.start(80, 80, 4);
  control.move(93, 80, 400);
  const stop = control.stop('pointerup', 416);

  assert.equal(stop.type, 'stop');
  assert.equal(stop.source, 'pointerup');
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
  assert.deepEqual(Array.from(control.getCommandsAfter(0), (command) => command.id), [1, 2]);
});

test('T6: a clear cross-axis segment changes direction without releasing', () => {
  const control = loadControl();
  control.start(100, 100, 5);
  control.move(100, 87, 500);
  assert.equal(control.move(112, 83, 516), null);
  const right = control.move(113, 83, 532);
  assert.deepEqual(plainDirection(right), { x: 1, y: 0 });
});

test('T7: a converging thumb arc turns after a long held straight movement', () => {
  const control = loadControl();
  control.start(100, 100, 6);
  assert.deepEqual(plainDirection(control.move(100, 87, 600)), { x: 0, y: -1 });

  const arc = [
    [100, 80], [100, 73], [104, 68], [108, 63], [112, 58], [116, 53]
  ];
  const emitted = arc.map(([x, y], index) => control.move(x, y, 616 + index * 16)).filter(Boolean);

  assert.deepEqual(emitted.map(plainDirection), [{ x: 1, y: 0 }]);
});

test('T8: sustained straight movement plus micro drift never oscillates axes', () => {
  const control = loadControl();
  control.start(100, 100, 7);
  control.move(100, 87, 700);
  const drift = [[102, 79], [99, 71], [102, 63], [99, 55], [101, 47]];
  drift.forEach(([x, y], index) => control.move(x, y, 716 + index * 16));
  assert.deepEqual(Array.from(control.getCommandsAfter(0), plainDirection), [{ x: 0, y: -1 }]);
});

test('formal UI exposes v0.10.3, full-screen controls and short-screen image containment', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');

  assert.match(index, /COREO DARK v0\.10\.3/);
  assert.match(index, /aria-label="連續滑動移動區"/);
  assert.doesNotMatch(index, /swipe-control-hint|digital-dpad|data-dpad-direction/);
  assert.match(css, /#joystick-zone\s*\{[\s\S]*?inset:\s*0;/);
  assert.doesNotMatch(css, /height:\s*max\(58%|left:\s*max\(env\(safe-area-inset-left\),\s*22px\)/);
  assert.match(main, /ControlLogic\.getCommandsAfter/);
  assert.match(main, /movePlayerAlongRails/);
  assert.match(css, /\.briefing-cinematic\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;/);
  assert.match(css, /\.cinematic-player img\s*\{[\s\S]*?max-height:\s*min\(170px, 24vh\);[\s\S]*?object-fit:\s*contain;/);
  assert.match(css, /\.cinematic-ember img\s*\{[\s\S]*?max-height:\s*min\(170px, 24vh\);[\s\S]*?object-fit:\s*contain;/);
});
