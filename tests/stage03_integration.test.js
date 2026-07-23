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

// 最短通關路：BFS 步數。硬底線＝必須 >= Stage 02(67)、Stage 01(58)，證明「不比前兩關簡單」。
function shortestPath(map) {
  const key = (x, y) => `${x},${y}`;
  let start = null, exit = null;
  for (let y = 0; y < map.length; y++) for (let x = 0; x < map[0].length; x++) {
    if (map[y][x] === 2) start = [x, y];
    if (map[y][x] === 3) exit = [x, y];
  }
  const q = [start]; const dist = new Map([[key(...start), 0]]);
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    if (x === exit[0] && y === exit[1]) return dist.get(key(x, y));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (map[ny]?.[nx] && !dist.has(k)) { dist.set(k, dist.get(key(x, y)) + 1); q.push([nx, ny]); }
    }
  }
  return Infinity;
}

test('Stage 03 uses the approved 9x48 multi-cycle maze topology', () => {
  const map = loadStage03Map();
  const stats = graphStats(map);
  assert.equal(stats.width, 9);
  assert.equal(stats.height, 48);
  assert.ok(stats.width * stats.height <= 450, 'total cells must stay within the mobile perf budget');
  assert.deepEqual(stats.start, [4, 2]);
  assert.deepEqual(stats.exit, [4, 47]);
  assert.equal(stats.components, 1);
  assert.equal(stats.reachableFromStart.size, stats.vertices, 'every walkable cell must be reachable');
  assert.ok(stats.reachableFromStart.has('4,47'));
  // S 原填 181 邊不可信；依 CC 指示在補 Shard 與 Pulse 側凹後由實際 map 重算。
  assert.equal(stats.vertices, 183);
  assert.equal(stats.edges, 190);
  assert.equal(stats.cycleRank, 8);
  assert.ok(stats.cycleRank / stats.vertices * 100 >= 2.5, 'topology density must be >= 2.5%');
  assert.equal(shortestPath(map), 69, 'Stage 03 shortest path must remain above Stage 02 (67)');
});

test('Stage 03 uses narrow corridors without open rooms or one-cell zigzags', () => {
  const map = loadStage03Map();
  for (let y = 0; y < map.length - 1; y++) {
    for (let x = 0; x < map[0].length - 1; x++) {
      const open2x2 = map[y][x] && map[y][x + 1] && map[y + 1][x] && map[y + 1][x + 1];
      assert.ok(!open2x2, `open-room 2x2 block is forbidden at ${x},${y}`);
    }
  }
  const rungs = [4, 10, 16, 22, 28, 34, 40, 46];
  for (const y of rungs) assert.ok(map[y].slice(1, 8).every(Boolean), `rung y=${y} must be a single-row corridor`);
});

test('Stage 03 never leaves the player without a turn option for more than 3 cells', () => {
  const map = loadStage03Map();
  const walkable = (x, y) => map[y]?.[x] !== undefined && map[y][x] !== 0;
  const canTurn = (x, y) => walkable(x - 1, y) || walkable(x + 1, y);
  for (let x = 0; x < map[0].length; x++) {
    let sinceTurn = 0;
    for (let y = 0; y < map.length; y++) {
      if (!walkable(x, y)) {
        sinceTurn = 0;
        continue;
      }
      sinceTurn = canTurn(x, y) ? 0 : sinceTurn + 1;
      assert.ok(
        sinceTurn <= 3,
        `corridor x=${x} has ${sinceTurn} cells with no side opening at y=${y}`
      );
    }
  }
});

test('Stage 03 keeps a fixed targeted turn alive through mobile frame pacing', () => {
  const main = read('js/main.js');
  assert.match(main, /STAGE_03_TURN_TARGET_MAX_AGE_MS\s*=\s*600/);
  assert.match(main, /currentStage\s*===\s*3[\s\S]*?hasPassedTargetBeyondGrace\(playerPos, queuedTurn\)/);
  assert.match(main, /currentStage\s*!==\s*3[\s\S]*?RailAssist\.queueExpired\(queuedTurn, playerPos, now\)/);
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

test('Stage 03 has three materially different start-to-exit routes', () => {
  const map = loadStage03Map();
  const start = [4, 2], exit = [4, 47], dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const key = (x, y) => `${x},${y}`;
  const paths = [];
  function visit(x, y, seen) {
    if (paths.length >= 2000) return;
    if (x === exit[0] && y === exit[1]) { paths.push([...seen]); return; }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy, nk = key(nx, ny);
      if (map[ny]?.[nx] && !seen.includes(nk)) visit(nx, ny, [...seen, nk]);
    }
  }
  visit(...start, [key(...start)]);
  const eligible = paths.filter((p) => p.length - 1 >= 69 && p.length - 1 <= 79);
  let bestMinUnique = 0;
  for (let a = 0; a < eligible.length; a++) for (let b = a + 1; b < eligible.length; b++) for (let c = b + 1; c < eligible.length; c++) {
    const trio = [eligible[a], eligible[b], eligible[c]];
    const unique = [];
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const left = new Set(trio[i]), right = new Set(trio[j]);
      unique.push([...left].filter((v) => !right.has(v)).length, [...right].filter((v) => !left.has(v)).length);
    }
    bestMinUnique = Math.max(bestMinUnique, Math.min(...unique));
  }
  assert.ok(paths.length >= 3, `expected >=3 complete routes, got ${paths.length}`);
  assert.ok(bestMinUnique >= 6, `three routes need >=6 mutually unused cells; got ${bestMinUnique}`);
});

test('Stage 03 SIPHON defends the Pulse while either end remains a real escape route', () => {
  const map = loadStage03Map();
  assert.equal(map[19][7], 5);
  const siphon = [[7, 17], [7, 18], [7, 20], [7, 21]];
  for (const [x, y] of siphon) assert.equal(map[y][x], 7, `SIPHON core at ${x},${y}`);
  const canReach = (target, blocked) => {
    const q = [[7, 19]], seen = new Set(['7,19', blocked]);
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      if (`${x},${y}` === target) return true;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy, nk = `${nx},${ny}`;
        if (map[ny]?.[nx] && !seen.has(nk)) { seen.add(nk); q.push([nx, ny]); }
      }
    }
    return false;
  };
  assert.ok(canReach('4,22', '7,17'), 'upper guard occupied: lower escape must reach the main maze');
  assert.ok(canReach('4,16', '7,21'), 'lower guard occupied: upper escape must reach the main maze');
  const counts = graphStats(map).counts;
  assert.equal(counts[4], 7);
  assert.equal(counts[5], 1);
  assert.equal(counts[6], 2);
  assert.equal(counts[7], 4);
});

test('Stage 03 ends with three identical-looking doors on the final rung', () => {
  const map = loadStage03Map();
  const exits = map.flatMap((row, y) => row.map((v, x) => (v === 3 ? `${x},${y}` : null))).filter(Boolean);
  assert.deepEqual(exits, ['4,47']);
  assert.equal(map[47][1], 6);   // 左：躲藏死路
  assert.equal(map[47][7], 6);   // 右：偽裝假門（不得是代號 3）
  assert.ok(map[46].slice(1, 8).every(Boolean), 'final rung must connect all three doors');
  for (const x of [1, 4, 7]) assert.notEqual(map[47][x], 0, `final door x=${x} must look usable`);
});

// 迴歸測試：SIPHON 巡邏點曾兩次落在牆格上（會造成貼牆、碰撞與抖動）。
// 地圖一改動就可能讓舊座標失效，這裡直接用正式地圖驗證每個巡邏點都踩在可走格中心。
test('Stage 03 SIPHON patrol points all sit on walkable cell centres', () => {
  const map = loadStage03Map();
  const main = read('js/main.js');
  const stage03Block = main.slice(main.indexOf("enemyName: 'SIPHON'"));
  const route = stage03Block.slice(0, stage03Block.indexOf(']'));
  const points = [...route.matchAll(/x:\s*([\d.]+)\s*\*\s*CELL_SIZE,\s*y:\s*([\d.]+)\s*\*\s*CELL_SIZE/g)]
    .map(([, x, y]) => [Number(x), Number(y)]);
  assert.ok(points.length >= 3, 'SIPHON 至少要有 3 個巡邏點');
  for (const [x, y] of points) {
    assert.ok(x % 1 === 0.5 && y % 1 === 0.5, `巡邏點 (${x}, ${y}) 必須是格子中心(.5)，整數倍會落在格線交界`);
    const cell = map[Math.floor(y)]?.[Math.floor(x)];
    assert.ok(cell !== undefined && cell !== 0, `巡邏點 (${x}, ${y}) 落在牆格或地圖外`);
  }
});

test('Stage 03 resource counts are exact', () => {
  const { counts } = graphStats(loadStage03Map());
  assert.equal(counts[2], 1);
  assert.equal(counts[3], 1);
  assert.equal(counts[4], 7);
  assert.equal(counts[5], 1);
  assert.equal(counts[6], 2);
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

test('Stage 03 entrance, exit and HUD progress stay stage-scoped', () => {
  const render3d = read('js/render3d.js');
  const main = read('js/main.js');
  const html = read('index.html');
  const css = read('css/tokens.css');
  assert.match(render3d, /stageId\s*===\s*3[\s\S]*?createStage03EntranceGate/);
  assert.match(render3d, /opensStage03Entrance[\s\S]*?leftWidth[\s\S]*?rightWidth/);
  assert.match(css, /#world\.stage-03\s*\{[\s\S]*?contain:\s*layout style;[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /\.stage03-entrance-gate\s*\{/);
  assert.doesNotMatch(css, /body\.stage-03-active::before/);
  assert.match(css, /\.stage-03 \.cell\.exit::before\s*\{/);
  assert.match(main, /function updateHudProgress\(\)/);
  assert.match(main, /Math\.min\(shardCount, SHARDS_PER_PULSE\)/);
  assert.match(html, /id="ui-shard-val">0\/5</);
  assert.match(html, /id="ui-pulse-val">0\/1</);
});

test('SIPHON asset and protected control architecture match the approved hashes', () => {
  const expected = {
    'assets/enemy_siphon.png': '218AA69FCB69A60BB3263FB579749354FE58844729A0C2A3D0CA3CFBB67E5060',
    'js/control.js': '78BD61F9EF95F1904925825A5F98584CD166220530062B0B18B4AAC3125509AD',
    'js/rail-assist.js': '2638C5AA59397661377FBBBC44B2C37EE2813CCBDF0DCCA5DE1B27821E5EE9B4',
    'js/camera.js': 'E3CF908095005AF6EF03F2B606A5F3C5D6E51332EAA89DF803F61F73B244CD59',
    'js/enemy.js': '1F275EDA78F71B346142B3D50A07A47D6F75D40CC5DF3D2A2AFF6C6B56DEE16E'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(sha256(file), hash, file);
});

test('formal version is CoreZax v0.10.9 and manifest remains protected', () => {
  assert.match(read('index.html'), /v0\.10\.9/);
  assert.match(read('index.html'), /CoreZax/);
  assert.match(read('manifest.json'), /"name": "CoreZax"/);
  assert.match(read('service-worker.js'), /corezax-v0109-stage03-visual-fix-20260723/);
  assert.match(read('service-worker.js'), /assets\/enemy_siphon\.png/);
});
