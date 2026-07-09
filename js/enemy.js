// js/enemy.js
const EnemyLogic = {
  x: 0, y: 0,
  state: 'patrol', // 'patrol' | 'alert' | 'chase'
  patrolFrom: null,
  patrolTo: null,
  currentTarget: null,
  baseAlertRadius: 220,
  alertRadius: 220,
  chaseDuration: 3000,
  chaseTimer: 0,
  speed: 2.6,
  radius: 24, // 碰撞半徑

  domElement: null,

  init: function(startPos, patrolFrom, patrolTo) {
    this.x = startPos.x;
    this.y = startPos.y;
    this.patrolFrom = patrolFrom;
    this.patrolTo = patrolTo;
    this.currentTarget = this.patrolTo;
    this.state = 'patrol';
    this.alertRadius = this.baseAlertRadius;

    // 建立 DOM
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
    const timeScale = dt / 16.66; // 基準化為 60fps 的移動量
    const distToPlayer = Math.hypot(playerPos.x - this.x, playerPos.y - this.y);

    // 狀態轉移邏輯
    if (this.state === 'patrol') {
      if (!isPlayerHidden && distToPlayer < this.alertRadius) {
        this.state = 'alert';
        this.chaseTimer = 400; // 短暫停留警戒
        FX.toggleGlobalAlert(true);
      }
    } else if (this.state === 'alert') {
      this.chaseTimer -= dt;
      if (this.chaseTimer <= 0) {
        this.state = 'chase';
        this.chaseTimer = this.chaseDuration;
      }
    } else if (this.state === 'chase') {
      if (isPlayerHidden || distToPlayer > this.alertRadius * 1.4) {
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

    // 移動邏輯
    let targetX = this.x; let targetY = this.y;
    if (this.state === 'patrol') {
      targetX = this.currentTarget.x;
      targetY = this.currentTarget.y;
      if (Math.hypot(targetX - this.x, targetY - this.y) < 5) {
        // 到達巡邏點，切換目標
        this.currentTarget = (this.currentTarget === this.patrolFrom) ? this.patrolTo : this.patrolFrom;
      }
    } else if (this.state === 'chase') {
      targetX = playerPos.x;
      targetY = playerPos.y;
    }

    // 執行位移 (警戒狀態不動)
    if (this.state !== 'alert') {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 1) {
        const vx = (dx / dist) * this.speed * timeScale;
        const vy = (dy / dist) * this.speed * timeScale;

        // X軸滑動
        if (!this.checkCollision(this.x + vx, this.y, mazeData, cellSize)) this.x += vx;
        // Y軸滑動
        if (!this.checkCollision(this.x, this.y + vy, mazeData, cellSize)) this.y += vy;
      }
    }

    this.updateDOM();
  },

  updateDOM: function() {
    this.domElement.style.left = `${this.x}px`;
    this.domElement.style.top = `${this.y}px`;
    this.domElement.className = `enemy-state-${this.state}`;
  }
};
