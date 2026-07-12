// js/enemy.js
const EnemyLogic = {
  x: 0, y: 0,
  state: 'patrol',
  type: 'villainHunt',
  patrolRoute: [],
  patrolIndex: 0,
  currentTarget: null,
  baseAlertRadius: 145,
  alertRadius: 145,
  pathAlertLimit: 7,
  pathSearchLimit: 24,
  chaseDuration: 11000,
  chaseTimer: 0,
  alertDelay: 180,
  patrolSpeed: 0.62,
  chaseSpeed: 1.30,
  radius: 22,
  reactionTimer: 0,
  reactionInterval: 180,
  chaseMemoryTimer: 0,
  chaseMemoryDuration: 1300,
  searchTimer: 0,
  searchDuration: 1800,
  imperfectStepChance: 0.22,
  lastKnownCell: null,
  chosenStep: { x: 0, y: -1 },
  domElement: null,
  spriteElement: null,
  guardAnchor: null,
  // v0.5.16：拿到 Pulse 往出口跑時，EMBER 要能持續施壓，追逐範圍從守護區錨點放大到接近出口，
  // 只在出口前留一小段安全區，確保玩家仍有辦法甩開，不會變成無解
  maxChaseDistanceFromGuard: 950,

  init: function(route, enemyType = 'villainHunt') {
    this.type = enemyType;
    this.patrolRoute = route;
    this.patrolIndex = 0;
    this.x = route[0].x;
    this.y = route[0].y;
    this.currentTarget = route[1 % route.length];
    this.state = 'patrol';
    this.alertRadius = this.baseAlertRadius;
    this.chaseTimer = 0;
    this.reactionTimer = 0;
    this.chaseMemoryTimer = 0;
    this.searchTimer = 0;
    this.lastKnownCell = null;
    this.chosenStep = { x: 0, y: -1 };
    // v0.5.14: 守護區錨點＝巡邏路線的平均座標，追逐放棄距離改成從這個錨點算，
    // 不再只看反派當下位置，才不會被巡邏路線鎖出一條假邊界線
    this.guardAnchor = route.reduce(
      (acc, p) => ({ x: acc.x + p.x / route.length, y: acc.y + p.y / route.length }),
      { x: 0, y: 0 }
    );

    const world = document.getElementById('world');
    if (!this.domElement) {
      this.domElement = document.createElement('div');
      this.domElement.id = 'enemy';
      this.domElement.className = 'actor';

      this.spriteElement = document.createElement('div');
      this.domElement.appendChild(this.spriteElement);
    }

    world.appendChild(this.domElement);
    this.updateDOM();
  },

  isWall: function(cx, cy, mazeData) {
    if (cy < 0 || cy >= mazeData.length || cx < 0 || cx >= mazeData[0].length) return true;
    // v0.5.25：躲藏凹槽(代號6)是玩家專屬躲藏格，只有單一出入口的死巷，
    // 反派若在追逐/搜索時被引導走進去，直接向量移動邏輯會卡在裡面出不來(視覺上像「躲起來不追了」)。
    // 對反派而言把這種格子當牆一樣禁止進入，從根本避免卡死。
    return mazeData[cy][cx] === 0 || mazeData[cy][cx] === 6;
  },

  toCell: function(pos, cellSize) {
    return { x: Math.floor(pos.x / cellSize), y: Math.floor(pos.y / cellSize) };
  },

  cellCenter: function(cell, cellSize) {
    return { x: cell.x * cellSize + cellSize / 2, y: cell.y * cellSize + cellSize / 2 };
  },

  checkCollision: function(px, py, mazeData, cellSize) {
    const left = Math.floor((px - this.radius) / cellSize);
    const right = Math.floor((px + this.radius) / cellSize);
    const top = Math.floor((py - this.radius) / cellSize);
    const bottom = Math.floor((py + this.radius) / cellSize);
    return this.isWall(left, top, mazeData) || this.isWall(right, top, mazeData) ||
           this.isWall(left, bottom, mazeData) || this.isWall(right, bottom, mazeData);
  },

  update: function(playerPos, isPlayerHidden, dt, mazeData, cellSize) {
    if (!this.domElement) return;
    const distToPlayer = Math.hypot(playerPos.x - this.x, playerPos.y - this.y);
    const pathToPlayer = isPlayerHidden ? null : this.findPathToPlayer(playerPos, mazeData, cellSize, this.pathSearchLimit);
    const pathDistance = pathToPlayer ? pathToPlayer.length : Infinity;

    if (!isPlayerHidden && pathToPlayer) {
      this.lastKnownCell = this.toCell(playerPos, cellSize);
      this.chaseMemoryTimer = this.chaseMemoryDuration;
    } else if (this.chaseMemoryTimer > 0) {
      this.chaseMemoryTimer -= dt;
    }

    if (this.state === 'patrol') {
      if (!isPlayerHidden && (pathDistance <= this.pathAlertLimit || distToPlayer < this.alertRadius)) {
        this.state = 'alert';
        this.chaseTimer = this.alertDelay;
        FX.toggleGlobalAlert(true);
      }
    } else if (this.state === 'alert') {
      if (isPlayerHidden) {
        this.state = 'patrol';
        FX.toggleGlobalAlert(false);
      } else {
        this.chaseTimer -= dt;
        if (this.chaseTimer <= 0) {
          this.state = 'chase';
          this.chaseTimer = this.chaseDuration;
          this.reactionTimer = 0;
        }
      }
    } else if (this.state === 'chase') {
      // chase 是最高優先移動模式：只有「玩家真的躲進 hide pocket」或「玩家真的拉開很遠距離」才會離開，
      // 不再依賴 pathToPlayer 是否找得到路（BFS 找不到路時，chase 靠 updatePathChase 的直接向量 fallback 繼續追）
      if (isPlayerHidden) {
        this.state = 'search';
        this.searchTimer = this.searchDuration;
        FX.toggleGlobalAlert(false);
      } else if (
        distToPlayer > this.alertRadius * 4 ||
        Math.hypot(this.x - this.guardAnchor.x, this.y - this.guardAnchor.y) > this.maxChaseDistanceFromGuard
      ) {
        // v0.5.17：原本 1.5 倍偵測距離的即時放棄門檻太小（約217px），玩家往出口衝刺時幾乎瞬間就會觸發，
        // 導致完全用不到守護區錨點那個更大的範圍——這才是「拿到 Pulse 後反派不追」的真正原因。
        // 改成 4 倍（約580px），讓守護區錨點範圍才是真正的主要邊界。玩家基礎速度(4.2)遠快於反派追逐速度(1.30)，
        // 只要持續移動仍然一定甩得掉，不會變成無解
        this.state = 'search';
        this.searchTimer = this.searchDuration;
        FX.toggleGlobalAlert(false);
      } else {
        this.chaseTimer -= dt;
        if (this.chaseTimer <= 0) {
          this.state = 'search';
          this.searchTimer = this.searchDuration;
          FX.toggleGlobalAlert(false);
        }
      }
    } else if (this.state === 'search') {
      if (!isPlayerHidden && pathToPlayer && (pathDistance <= this.pathAlertLimit || distToPlayer < this.alertRadius)) {
        // 搜索途中重新發現玩家，直接回追逐
        this.state = 'chase';
        this.chaseTimer = this.chaseDuration;
        this.reactionTimer = 0;
        FX.toggleGlobalAlert(true);
      } else {
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) {
          this.state = 'patrol';
        }
      }
    }

    if (this.state === 'patrol') {
      this.updatePatrol(dt, mazeData, cellSize);
    } else if (this.state === 'chase') {
      this.updatePathChase(playerPos, pathToPlayer, dt, mazeData, cellSize);
    } else if (this.state === 'search') {
      this.updateSearch(dt, mazeData, cellSize);
    }

    this.updateDOM();
  },

  updatePatrol: function(dt, mazeData, cellSize) {
    if (!this.currentTarget) return;
    if (Math.hypot(this.currentTarget.x - this.x, this.currentTarget.y - this.y) < 6) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolRoute.length;
      this.currentTarget = this.patrolRoute[this.patrolIndex];
    }
    this.moveToward(this.currentTarget, this.patrolSpeed, dt, mazeData, cellSize, true);
  },

  // 搜索：走向玩家最後已知位置附近，不是精準導航，到了就地徘徊直到 searchTimer 結束
  updateSearch: function(dt, mazeData, cellSize) {
    if (!this.lastKnownCell) return;
    const target = this.cellCenter(this.lastKnownCell, cellSize);
    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    if (dist < 8) return;
    this.moveToward(target, this.patrolSpeed * 1.05, dt, mazeData, cellSize, true);
  },

  // 追逐：每一幀都直接朝玩家目前位置移動，用跟巡邏/搜索同一套 moveToward，
  // 保證反派一定會持續移動靠近玩家，不依賴路徑計算是否成功
  updatePathChase: function(playerPos, pathToPlayer, dt, mazeData, cellSize) {
    this.moveToward(playerPos, this.chaseSpeed, dt, mazeData, cellSize, true);
  },

  findPathToPlayer: function(playerPos, mazeData, cellSize, limit) {
    const goal = this.toCell(playerPos, cellSize);
    return this.findPathToCell(goal, mazeData, cellSize, limit);
  },

  findPathToCell: function(goal, mazeData, cellSize, limit) {
    const start = this.toCell({ x: this.x, y: this.y }, cellSize);
    if (this.isWall(start.x, start.y, mazeData) || this.isWall(goal.x, goal.y, mazeData)) return null;
    if (start.x === goal.x && start.y === goal.y) return [];

    const key = (p) => `${p.x},${p.y}`;
    const queue = [{ x: start.x, y: start.y, path: [] }];
    const visited = new Set([key(start)]);
    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.path.length >= limit) continue;

      for (const dir of dirs) {
        const next = { x: current.x + dir.x, y: current.y + dir.y };
        const nextKey = key(next);
        if (visited.has(nextKey) || this.isWall(next.x, next.y, mazeData)) continue;

        const path = current.path.concat(dir);
        if (next.x === goal.x && next.y === goal.y) return path;

        visited.add(nextKey);
        queue.push({ x: next.x, y: next.y, path });
      }
    }

    return null;
  },

  chooseMemoryStep: function(mazeData, cellSize) {
    if (!this.lastKnownCell || this.chaseMemoryTimer <= 0) return null;
    const memoryPath = this.findPathToCell(this.lastKnownCell, mazeData, cellSize, this.pathSearchLimit);
    return memoryPath && memoryPath.length ? memoryPath[0] : null;
  },

  chooseClumsyStep: function(playerPos, mazeData, cellSize) {
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const primary = Math.abs(dx) > Math.abs(dy)
      ? [{x: Math.sign(dx), y: 0}, {x: 0, y: Math.sign(dy)}]
      : [{x: 0, y: Math.sign(dy)}, {x: Math.sign(dx), y: 0}];
    const fallback = [
      {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}
    ];
    const candidates = primary.concat(fallback).filter((step) => step.x !== 0 || step.y !== 0);
    for (const step of candidates) {
      const testX = this.x + step.x * this.radius;
      const testY = this.y + step.y * this.radius;
      if (!this.checkCollision(testX, testY, mazeData, cellSize)) return step;
    }
    return {x: 0, y: 0};
  },

  moveToward: function(target, speed, dt, mazeData, cellSize, allowAxisSlide) {
    const timeScale = dt / 16.66;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1) return;
    const vx = (dx / dist) * speed * timeScale;
    const vy = (dy / dist) * speed * timeScale;
    if (!this.checkCollision(this.x + vx, this.y + vy, mazeData, cellSize)) {
      this.x += vx;
      this.y += vy;
      return;
    }
    if (allowAxisSlide) {
      if (!this.checkCollision(this.x + vx, this.y, mazeData, cellSize)) this.x += vx;
      if (!this.checkCollision(this.x, this.y + vy, mazeData, cellSize)) this.y += vy;
    }
  },

  updateDOM: function() {
    this.domElement.style.left = `${this.x}px`;
    this.domElement.style.top = `${this.y}px`;
    const typeClass = this.type.replace(/([A-Z])/g, '-$1').toLowerCase();
    this.spriteElement.className = `actor-sprite enemy-state-${this.state} ${typeClass}`;
  }
};
