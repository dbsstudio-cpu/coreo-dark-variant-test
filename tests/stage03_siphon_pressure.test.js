const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadMaze() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${read('js/maze.js')}; globalThis.map = MazeLogic.getStage03Map();`, sandbox);
  return sandbox.map;
}

function loadPressure() {
  const sandbox = {
    FX: { toggleGlobalAlert() {} },
    EnemyLogic: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(read('js/siphon-pressure.js'), sandbox);
  return sandbox.SiphonPressure;
}

function loadRuntime() {
  const sandbox = {
    FX: { toggleGlobalAlert() {} },
    document: { getElementById() { return null; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${read('js/enemy.js')}; globalThis.EnemyLogic = EnemyLogic;`,
    sandbox
  );
  vm.runInContext(read('js/siphon-pressure.js'), sandbox);
  return sandbox;
}

test('SIPHON pressure module is isolated between enemy.js and main.js', () => {
  const html = read('index.html');
  const enemyAt = html.indexOf('js/enemy.js');
  const pressureAt = html.indexOf('js/siphon-pressure.js');
  const mainAt = html.indexOf('js/main.js');
  assert.ok(enemyAt >= 0 && enemyAt < pressureAt && pressureAt < mainAt);
  assert.match(read('service-worker.js'), /js\/siphon-pressure\.js/);
});

test('direct Stage 03 Pulse arms a persistent full-map hunt', () => {
  const main = read('js/main.js');
  assert.match(main, /function armStage03SiphonHunt\(\)/);
  assert.match(main, /currentStage !== 3/);
  assert.match(main, /armStage02ReturnPressure\(\);\s*armStage03SiphonHunt\(\);/);
  assert.match(main, /siphonPressure:\s*currentStage === 3 \? SiphonPressure\.snapshot\(\) : null/);
  assert.match(main, /SiphonPressure\.restore\(restoredRun\.siphonPressure\)/);
});

test('hunt uses the approved pressure values and never returns to the guard loop', () => {
  const pressure = loadPressure();
  pressure.reset();
  pressure.armHunt({
    playerPos: { x: 225, y: 125 },
    cellSize: 50,
    direction: { x: 0, y: 1 }
  });
  assert.equal(pressure.huntActive, true);
  assert.equal(pressure.phase, 'hunt_acquire');
  assert.equal(pressure.tuning.huntChaseSpeed, 3.15);
  assert.equal(pressure.tuning.huntInterceptSpeed, 3.05);
  assert.equal(pressure.tuning.huntSearchSpeed, 2.60);
  assert.equal(pressure.tuning.huntMemoryDuration, 8000);
  assert.equal(pressure.tuning.huntSearchDuration, 6500);
  assert.doesNotMatch(read('js/siphon-pressure.js'), /phase\s*=\s*['"]return['"]/);
});

test('intercept prediction uses two shared BFS maps and selects a walkable forward junction', () => {
  const map = loadMaze();
  const pressure = loadPressure();
  pressure.reset();
  pressure.lastPlayerDirection = { x: 0, y: 1 };
  const enemy = {
    x: 7.5 * 50,
    y: 19.5 * 50,
    toCell(pos, cellSize) {
      return { x: Math.floor(pos.x / cellSize), y: Math.floor(pos.y / cellSize) };
    }
  };
  const result = pressure._debugChooseIntercept(enemy, { x: 4, y: 10 }, map, 3.05);
  assert.equal(result.bfsRuns, 2);
  assert.ok(result.target, 'a forward intercept junction must be selected');
  assert.notEqual(map[result.target.y][result.target.x], 0);
  assert.ok(result.target.y >= 10, 'the target must not be behind a downward-moving player');
});

test('full-map hunt leaves the Pulse guard corridor without teleporting', () => {
  const map = loadMaze();
  const runtime = loadRuntime();
  const enemy = runtime.EnemyLogic;
  const pressure = runtime.SiphonPressure;
  Object.assign(enemy, {
    x: 7.5 * 50,
    y: 19.5 * 50,
    pathSearchLimit: 64,
    pathAlertLimit: 12,
    alertRadius: 165,
    chaseMemoryDuration: 8000,
    searchDuration: 6500
  });
  pressure.reset();
  pressure.armHunt({
    playerPos: { x: 4.5 * 50, y: 40.5 * 50 },
    cellSize: 50,
    direction: { x: 0, y: 1 }
  });
  const start = { x: enemy.x, y: enemy.y };
  for (let i = 0; i < 900; i++) {
    enemy.updateSiphon(
      { x: 4.5 * 50, y: 40.5 * 50 },
      false,
      16.66,
      map,
      50
    );
  }
  assert.ok(Math.hypot(enemy.x - start.x, enemy.y - start.y) > 150, 'SIPHON must leave its guard position');
  assert.ok(Math.floor(enemy.y / 50) > 21, 'SIPHON must enter the lower full-map hunt area');
  assert.equal(pressure.huntActive, true);
  assert.doesNotMatch(pressure.phase, /return|guard_patrol/);
  assert.match(enemy.state, /alert|chase|search/);
});

test('iOS actors render above the Stage 03 wall depth', () => {
  const css = read('css/tokens.css');
  const actorDepth = Number(css.match(/\.actor\s*\{[\s\S]*?translateZ\((\d+)px\)/)?.[1]);
  const wallDepth = Number(css.match(/\.stage-03 \.cell\.wall\s*\{[\s\S]*?translateZ\((\d+)px\)/)?.[1]);
  assert.ok(actorDepth > wallDepth, `actor depth ${actorDepth} must exceed wall depth ${wallDepth}`);
  assert.match(css, /\.actor\s*\{[\s\S]*?-webkit-transform:[\s\S]*?translateZ\(22px\)/);
  assert.match(css, /#enemy\.actor\s*\{\s*z-index:\s*100/);
});
