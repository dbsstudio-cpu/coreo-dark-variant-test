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
  chaseDuration: 2600,
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
    return mazeData[cy][cx] === 0;
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
      } else if (distToPlayer > this.alertRadius * 1.5) {
        // 玩家只要拉開約 1.5 倍偵測距離，反派就會放棄追逐，確保玩家有實際逃脫空間，
        // 不會被黏在窄通道動彈不得
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
