const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadStage01() {
  const filename = path.join(root, 'js', 'maze.js');
  const source = `${fs.readFileSync(filename, 'utf8')}\n;globalThis.__maze = MazeLogic;`;
  const context = { console };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  return context.__maze.getStage01Map();
}

function findCell(map, type) {
  for (let y = 0; y < map.length; y += 1) {
    const x = map[y].indexOf(type);
    if (x !== -1) return { x, y };
  }
  return null;
}

function openNeighbors(map, cell) {
  return [[0, 1], [1, 0], [0, -1], [-1, 0]]
    .map(([dx, dy]) => ({ x: cell.x + dx, y: cell.y + dy }))
    .filter(({ x, y }) => map[y] && map[y][x] !== undefined && map[y][x] !== 0);
}

function shortestDistance(map, start, goal) {
  const queue = [{ ...start, distance: 0 }];
  const visited = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const current = queue.shift();
    if (current.x === goal.x && current.y === goal.y) return current.distance;
    for (const next of openNeighbors(map, current)) {
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ ...next, distance: current.distance + 1 });
    }
  }
  return Infinity;
}

function reachableCells(map, start) {
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const current = queue.shift();
    for (const next of openNeighbors(map, current)) {
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return visited;
}

test('Stage 01 uses a top entrance and a lower side-entry exit', () => {
  const map = loadStage01();
  assert.equal(map.length, 39);
  assert.ok(map.every((row) => row.length === 7));
  assert.deepEqual(findCell(map, 2), { x: 3, y: 0 });
  assert.deepEqual(findCell(map, 3), { x: 5, y: 38 });
  assert.notEqual(findCell(map, 2).x, findCell(map, 3).x);
});

test('Stage 01 gives a safe three-cell introduction before the first branch', () => {
  const map = loadStage01();
  const start = findCell(map, 2);
  assert.equal(openNeighbors(map, start).length, 1);
  assert.equal(openNeighbors(map, { x: 3, y: 1 }).length, 2);
  assert.equal(openNeighbors(map, { x: 3, y: 2 }).length, 2);
  assert.ok(openNeighbors(map, { x: 3, y: 3 }).length >= 3);
});

test('Stage 01 remains solvable and keeps its resource and risk structure', () => {
  const map = loadStage01();
  const start = findCell(map, 2);
  const exit = findCell(map, 3);
  assert.ok(Number.isFinite(shortestDistance(map, start, exit)));
  assert.equal(reachableCells(map, start).size, map.flat().filter((type) => type !== 0).length);
  assert.equal(openNeighbors(map, exit).length, 1);
  assert.ok(map.flat().filter((type) => type === 4).length >= 5);
  assert.equal(map.flat().filter((type) => type === 5).length, 1);
  assert.ok(map.flat().filter((type) => type === 6).length >= 2);
  assert.ok(shortestDistance(map, start, { x: 1, y: 17 }) >= 15);
});

test('Stage 01 camera and briefing point downward without touching control architecture', () => {
  const main = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
  const lab = fs.readFileSync(path.join(root, 'js', 'main-control-lab.js'), 'utf8');
  const ccLab = fs.readFileSync(path.join(root, 'js', 'cc_main.js'), 'utf8');
  assert.match(main, /1:\s*\{[\s\S]*?exitDirection:\s*'down'/);
  assert.match(main, /啟動下方出口/);
  assert.match(lab, /1:\s*\{[\s\S]*?exitDirection:\s*'down'/);
  assert.match(ccLab, /s1:\s*\{\s*stage:\s*1,\s*exitDirection:\s*'down'/);
});
