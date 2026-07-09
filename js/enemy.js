// js/enemy.js
const EnemyLogic = {
  x: 0, y: 0,
  state: 'patrol',
  patrolRoute: [],
  patrolIndex: 0,
  currentTarget: null,
  baseAlertRadius: 250,
  alertRadius: 250,
  chaseDuration: 3600,
  chaseTimer: 0,
  alertDelay: 420,
  patrolSpeed: 1.05,
  chaseSpeed: 2.05,
  radius: 22,
  reactionTimer: 0,
  reactionInterval: 170,
  chosenStep: { x: 0, y: -1 },
  domElement: null,

  init: function(startPos, patrolFrom, patrolTo, patrolRoute) {
    this.x = startPos.x;
    this.y = startPos.y;
    this.patrolRoute = patrolRoute && patrolRoute.length ? patrolRoute : [patrolFrom, patrolTo].filter(Boolean);
    this.patrolIndex = 0;
    this.currentTarget = this.patrolRoute[0] || startPos;
    this.state = 'patrol';
    this.alertRadius = this.baseAlertRadius;
    this.chaseTimer = 0;
    this.reactionTimer = 0;

    const world = document.getElementById('world');
    this.domElement = document.createElement('div');
    this.domElement.id = 'enemy';
    world.appendChild(this.domElement);
    this.updateDOM();
  },

  isWall: function(cx, cy, mazeData) {
    if (cy < 0 || cy >= mazeData.length || cx < 0 || cx >= mazeData[0].length) return true;
    return mazeData[cy][cx] === 0;
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

    if (this.state === 'patrol') {
      if (!isPlayerHidden && distToPlayer < this.alertRadius) {
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
      if (isPlayerHidden || distToPlayer > this.alertRadius * 1.55) {
        this.state = 'patrol';
        FX.toggleGlobalAlert(false);
      } else {
        this.chaseTimer -= dt;
        if (this.chaseTimer <= 0) {
          this.state = 'patrol';
          FX.toggleGlobalAlert(false);
        }
      }
    }

    if (this.state === 'patrol') {
      this.updatePatrol(dt, mazeData, cellSize);
    } else if (this.state === 'chase') {
      this.updateClumsyChase(playerPos, dt, mazeData, cellSize);
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

  updateClumsyChase: function(playerPos, dt, mazeData, cellSize) {
    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      this.chosenStep = this.chooseClumsyStep(playerPos, mazeData, cellSize);
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
    this.domElement.className = `enemy-state-${this.state}`;
  }
};
