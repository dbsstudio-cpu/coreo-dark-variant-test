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

test('正式 v0.9.7 以 5px 最近增量立即反向', () => {
  const control = loadControl();
  assert.equal(control.VERSION, 'v0.9.7');
  control.start(100, 100, 1, 100);
  const up = control.move(100, 93, 116);
  assert.deepEqual({ ...up.direction }, { x: 0, y: -1 });
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: -1 });

  assert.equal(control.move(100, 86, 132), null);
  const down = control.move(100, 91, 148);
  assert.deepEqual({ ...down.direction }, { x: 0, y: 1 });
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 1 });
  assert.equal(down.id, 2);
});

test('正式 v0.9.7 命令逐筆保留且放開立即停止', () => {
  const control = loadControl();
  control.start(50, 50, 7, 200);
  control.move(57, 50, 216);
  control.move(57, 57, 232);
  const stop = control.stop('pointerup', 248);

  assert.equal(stop.type, 'stop');
  assert.deepEqual({ ...control.getVector() }, { x: 0, y: 0 });
  assert.deepEqual(Array.from(control.getCommandsAfter(0), (command) => command.id), [1, 2, 3]);
});

test('正式首頁、移動層與快取版本同步升為 v0.9.7', () => {
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

  assert.match(index, /COREO DARK v0\.9\.7/);
  assert.match(main, /ControlLogic\.getCommandsAfter/);
  assert.match(main, /movePlayerAlongRails/);
  assert.doesNotMatch(main, /const vec = ControlLogic\.getVector\(\)/);
  assert.match(serviceWorker, /coreo-dark-variant-v097-control-20260718/);
});
