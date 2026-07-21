const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const sha256 = (relativePath) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex').toUpperCase();

function loadStage03Map() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${read('js/maze.js')}\n;globalThis.__MazeLogic = MazeLogic;`, context);
  return JSON.parse(JSON.stringify(context.__MazeLogic.getStage03Map()));
}

function graphStats(map) {
  const height = map.length;
  const width = map[0].length;
  const key = (x, y) => `${x},${y}`;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const nodes = [];
  const counts = {};
  let edges = 0;
  let start = null;
  let exit = null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = map[y][x];
      counts[value] = (counts[value] || 0) + 1;
      if (!value) continue;
      nodes.push([x, y]);
      if (value === 2) start = [x, y];
      if (value === 3) exit = [x, y];
      if (x + 1 < width && map[y][x + 1]) edges++;
      if (y + 1 < height && map[y + 1][x]) edges++;
    }
  }

  const unvisited = new Set(nodes.map(([x, y]) => key(x, y)));
  let components = 0;
  let reachableFromStart = new Set();
  while (unvisited.size) {
    components++;
    const seed = unvisited.values().next().value;
    const queue = [seed];
    const seen = new Set([seed]);
    unvisited.delete(seed);
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      const [x, y] = current.split(',').map(Number);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        const next = key(nx, ny);
        if (!map[ny]?.[nx] || seen.has(next)) continue;
        seen.add(next);
        unvisited.delete(next);
        queue.push(next);
      }
    }
    if (start && seen.has(key(...start))) reachableFromStart = seen;
  }

  const degree = new Map();
  for (const [x, y] of nodes) {
    degree.set(key(x, y), dirs.filter(([dx, dy]) => map[y + dy]?.[x + dx]).length);
  }
  const peel = [...degree].filter(([, value]) => value < 2).map(([node]) => node);
  while (peel.length) {
    const node = peel.pop();
    if (!degree.has(node)) continue;
    degree.delete(node);
    const [x, y] = node.split(',').map(Number);
    for (const [dx, dy] of dirs) {
      const neighbor = key(x + dx, y + dy);
      if (!degree.has(neighbor)) continue;
      degree.set(neighbor, degree.get(neighbor) - 1);
      if (degree.get(neighbor) < 2) peel.push(neighbor);
    }
  }

  return {
    width,
    height,
    counts,
    vertices: nodes.length,
    edges,
    components,
    cycleRank: edges - nodes.length + components,
    twoCore: degree.size,
    start,
    exit,
    reachableFromStart
  };
}

test('Stage 03 uses the approved 9x44 multi-cycle maze topology', () => {
  const stats = graphStats(loadStage03Map());
  assert.equal(stats.width, 9);
  assert.equal(stats.height, 44);
  assert.ok(stats.width * stats.height <= 450, 'total cells must stay within the mobile perf budget');
  assert.deepEqual(stats.start, [4, 2]);
  assert.deepEqual(stats.exit, [4, 43]);
  assert.equal(stats.components, 1);
  assert.equal(stats.reachableFromStart.size, stats.vertices, 'every walkable cell must be reachable');
  assert.ok(stats.reachableFromStart.has('4,43'));
  // 迷宮感的關鍵：多個獨立環。上一版 cycleRank=1 等於「起點到出口只有唯一一條路」，已被 Sean 否決。
  assert.ok(stats.cycleRank >= 5 && stats.cycleRank <= 8, `cycle rank ${stats.cycleRank} must stay in 5~8`);
});

// 迴歸測試：真機回報「走一段會卡住、左右轉不了」。根因是走廊太長沒有開口，
// 導致 v0.10.5 的轉向意圖找不到合法路口。這裡強制每 3 格內必須有一次可轉的機會。
test('Stage 03 never leaves the player without a turn option for more than 3 cells', () => {
  const map = loadStage03Map();
  const walkable = (x, y) => map[y] !== undefined && map[y][x] !== undefined && map[y][x] !== 0;
  const canTurn = (x, y) => walkable(x - 1, y) || walkable(x + 1, y);
  for (let x = 0; x < 9; x++) {
    let sinceTurn = 0;
    for (let y = 0; y < map.length; y++) {
      if (!walkable(x, y)) { sinceTurn = 0; continue; }
      sinceTurn = canTurn(x, y) ? 0 : sinceTurn + 1;
      assert.ok(sinceTurn <= 3, `corridor x=${x} has ${sinceTurn} cells with no side opening at y=${y}`);
    }
  }
});

test('Stage 03 entrance uses a top safety frame and a wide gate hall, not one solid slab', () => {
  const map = loadStage03Map();
  assert.equal(map[0][4], 0, '上緣安全框：入口牆體不得貼世界邊界');
  assert.equal(map[2][4], 2, '起點必須置中於 x=4');
  // 閘門大廳：至少 5 格寬，避免「一格走廊被左右巨大實心方塊夾住」（Sean 真機退回過的畫面）
  assert.ok(map[1].slice(2, 7).every((v) => v !== 0), '入口需有 ≥5 格寬的閘門大廳');
  // 入口前 5 列中，「單格走廊＋左右各 ≥4 欄實心牆」的列數不得超過 2
  let slabRows = 0;
  for (let y = 0; y <= 4; y++) {
    const open = map[y].filter((v) => v !== 0).length;
    if (open === 1) slabRows++;
  }
  assert.ok(slabRows <= 2, `入口前 5 列有 ${slabRows} 列是被實心大塊夾住的單格走廊，最多只允許 2 列`);
});

test('Stage 03 central trunk is broken three times so the player must choose left or right', () => {
  const map = loadStage03Map();
  for (const [from, to] of [[8, 9], [20, 21], [32, 33]]) {
    for (let y = from; y <= to; y++) assert.equal(map[y][4], 0, `central trunk must be blocked at y=${y}`);
  }
  for (const y of [4, 40]) {
    assert.ok(map[y].slice(1, 8).every((v) => v !== 0), `full rung y=${y} must be walkable across`);
  }
});

test('Stage 03 forces the risky right trunk: only route to the mandatory Core Pulse', () => {
  const map = loadStage03Map();
  assert.equal(map[25][7], 5);                                   // Core Pulse 在右幹
  for (const y of [23, 24, 26, 27]) assert.equal(map[y][7], 7);  // SIPHON 核心區上下包夾
  for (let y = 23; y <= 27; y++) assert.notEqual(map[y][1], 0);  // 左幹同段安全可通行但拿不到 Pulse
  const counts = graphStats(map).counts;
  assert.equal(counts[4], 7);   // 7 顆能量只能組 1 顆 Pulse（需 5 顆/顆），第 2 顆必須冒險拿 (7,25)
  assert.equal(counts[5], 1);
  assert.equal(counts[6], 1);
  assert.equal(counts[7], 4);
});

test('Stage 03 ends with three identical-looking corridors: hide / real exit / decoy', () => {
  const map = loadStage03Map();
  const exits = map.flatMap((row, y) => row.map((v, x) => (v === 3 ? `${x},${y}` : null))).filter(Boolean);
  assert.deepEqual(exits, ['4,43']);
  assert.equal(map[43][1], 6);   // 左：躲藏死路
  assert.equal(map[43][7], 1);   // 右：假出口死路（不得是代號 3）
  for (const x of [1, 4, 7]) {
    for (let y = 41; y <= 42; y++) assert.notEqual(map[y][x], 0, `final corridor x=${x} must run to the bottom`);
  }
});

test('Stage 03 resource counts are exact', () => {
  const { counts } = graphStats(loadStage03Map());
  assert.equal(counts[2], 1);
  assert.equal(counts[3], 1);
  assert.equal(counts[4], 7);
  assert.equal(counts[5], 1);
  assert.equal(counts[6], 1);
  assert.equal(counts[7], 4);
});

test('Stage 03 is wired into the formal UI and existing enemy engine', () => {
  const main = read('js/main.js');
  const html = read('index.html');
  const css = read('css/tokens.css');
  assert.match(main, /3:\s*\{[\s\S]*?getMap:\s*\(\)\s*=>\s*MazeLogic\.getStage03Map\(\)/);
  assert.match(main, /enemyType:\s*'siphon'/);
  assert.match(main, /pulseRequirement:\s*2/);
  assert.match(main, /initEnemyForStage\(currentStage\)/);
  assert.match(main, /initEnemyForStage\(stageId\)/);
  assert.match(main, /7\.5\s*\*\s*CELL_SIZE/);
  assert.doesNotMatch(main, /\{\s*x:\s*7\s*\*\s*CELL_SIZE,\s*y:\s*17\s*\*\s*CELL_SIZE\s*\}/);
  assert.match(html, /id="btn-stage-3"\s+class="stage-card locked"/);
  assert.match(html, /id="briefing-enemy-img"/);
  assert.match(css, /#enemy \.actor-sprite\.siphon/);
  assert.match(css, /#world\.stage-03\.circuit-pulse/);
  assert.doesNotMatch(html, /stage03-lab/i);
  assert.doesNotMatch(main, /ringState|moveAxis|moveSign/);
});

test('SIPHON asset and protected control architecture match the approved hashes', () => {
  const expected = {
    'assets/enemy_siphon.png': '218AA69FCB69A60BB3263FB579749354FE58844729A0C2A3D0CA3CFBB67E5060',
    'js/control.js': '78BD61F9EF95F1904925825A5F98584CD166220530062B0B18B4AAC3125509AD',
    'js/rail-assist.js': '2638C5AA59397661377FBBBC44B2C37EE2813CCBDF0DCCA5DE1B27821E5EE9B4',
    'js/camera.js': 'E3CF908095005AF6EF03F2B606A5F3C5D6E51332EAA89DF803F61F73B244CD59',
    'js/enemy.js': 'DB7A09B3C252722FC1C883452591ABB3193D8F06B4C4263EB914011E1569E0A8'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(sha256(file), hash, file);
});

test('formal version is v0.10.7 and manifest remains protected', () => {
  assert.match(read('index.html'), /v0\.10\.7/);
  assert.equal(sha256('manifest.json'), '84D5BE74C5F6E0FF307F368D5695459CFFECE2E6832F307C032879CC8FC48228');
  assert.match(read('service-worker.js'), /coreo-dark-variant-v0107-stage03-integrated-20260720/);
  assert.match(read('service-worker.js'), /assets\/enemy_siphon\.png/);
});
