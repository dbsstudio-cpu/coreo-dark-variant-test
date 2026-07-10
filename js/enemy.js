// js/enemy.js
const EnemyLogic = {
  x: 0, y: 0,
  state: 'patrol',
  type: 'villainHunt',
  patrolRoute: [],
  patrolIndex: 0,
  currentTarget: null,
  baseAlertRadius: 210,
  alertRadius: 210,
  pathAlertLimit: 12,
  pathSearchLimit: 24,
  chaseDuration: 3200,
  chaseTimer: 0,
  alertDelay: 220,
  patrolSpeed: 0.84,
  chaseSpeed: 1.78,
  radius: 22,
  reactionTimer: 0,
  reactionInterval: 220,
  chaseMemoryTimer: 0,
  chaseMemoryDuration: 1000,
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
      if (isPlayerHidden) {
        this.state = 'patrol';
        FX.toggleGlobalAlert(false);
      } else if (!pathToPlayer && this.chaseMemoryTimer <= 0 && distToPlayer > this.alertRadius * 1.6) {
        this.state = 'patrol';
        FX.toggleGlobalAlert(false);
      } else {
        this.chaseTimer -= dt;
        if (this.chaseTimer <= 0 && pathDistance > this.pathAlertLimit + 4) {
          this.state = 'patrol';
          FX.toggleGlobalAlert(false);
        }
      }
    }

    if (this.state === 'patrol') {
      this.updatePatrol(dt, mazeData, cellSize);
    } else if (this.state === 'chase') {
      this.updatePathChase(playerPos, pathToPlayer, dt, mazeData, cellSize);
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

  updatePathChase: function(playerPos, pathToPlayer, dt, mazeData, cellSize) {
    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      const pathStep = pathToPlayer && pathToPlayer.length ? pathToPlayer[0] : null;
      this.chosenStep = pathStep || this.chooseMemoryStep(mazeData, cellSize) || this.chooseClumsyStep(playerPos, mazeData, cellSize);
      this.reactionTimer = this.reactionInterval;
    }

    const timeScale = dt / 16.66;
    const stepX = this.chosenStep.x * this.chaseSpeed * timeScale;
    const stepY = this.chosenStep.y * this.chaseSpeed * timeScale;
    if (!this.checkCollision(this.x + stepX, this.y + stepY, mazeData, cellSize)) {
      this.x += stepX;
      this.y += stepY;
    } else {
      this.reactionTimer = 0;
    }
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
