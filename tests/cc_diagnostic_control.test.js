const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadControl() {
  const filename = path.join(__dirname, '..', 'js', 'cc_diagnostic_control.js');
  const source = `${fs.readFileSync(filename, 'utf8')}\n;globalThis.__control = CCDiagnosticControl;`;
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

test('反向只需最近 5px，不必跨回 30+9px 舊錨點', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.9.7-D2');
  control.debugStart(100, 100, 100);

  const up = control.debugMove(100, 93, 116);
  assert.equal(up.id, 1);
  assert.deepEqual({ ...up.direction }, { x: 0, y: -1 });
  assert.equal(control.inputLatency, 16);

  // 同方向繼續移動只更新比較起點，不重送同一命令。
  assert.equal(control.debugMove(100, 86, 132), null);
  assert.equal(control.commandId, 1);

  const down = control.debugMove(100, 91, 148);
  assert.equal(down.id, 2);
  assert.deepEqual({ ...down.direction }, { x: 0, y: 1 });
  assert.equal(control.inputLatency, 16);
});

test('換軸命令一次成立、一次消費，放開另送 stop', () => {
  const control = loadControl();
  control.debugStart(50, 50, 200);
  const right = control.debugMove(57, 50, 216);
  assert.equal(right.type, 'direction');
  assert.deepEqual({ ...right.direction }, { x: 1, y: 0 });
  assert.equal(control.getCommandAfter(0).id, 1);
  assert.equal(control.getCommandAfter(1), null);

  const down = control.debugMove(57, 57, 232);
  assert.equal(down.id, 2);
  assert.deepEqual({ ...down.direction }, { x: 0, y: 1 });

  const stop = control.debugEnd(248);
  assert.equal(stop.id, 3);
  assert.equal(stop.type, 'stop');
  assert.equal(stop.direction, null);
  assert.equal(control.isActive, false);
  assert.deepEqual(Array.from(control.getCommandsAfter(0), (command) => command.id), [1, 2, 3]);
  assert.deepEqual(Array.from(control.getCommandsAfter(1), (command) => command.id), [2, 3]);
});

test('不足門檻的抖動不產生命令', () => {
  const control = loadControl();
  control.debugStart(20, 20, 300);
  assert.equal(control.debugMove(22, 21, 316), null);
  assert.equal(control.debugMove(19, 19, 332), null);
  assert.equal(control.commandId, 0);
});
