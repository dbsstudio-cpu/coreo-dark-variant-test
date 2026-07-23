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
  stuckTimer: 0,
  lastMoveX: 0,
  lastMoveY: 0,
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
    this.stuckTimer = 0;
    this.lastMoveX = this.x;
    this.lastMoveY = this.y;
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

    if (this.type === 'siphon') {
      this.updateSiphon(playerPos, isPlayerHidden, dt, mazeData, cellSize);
      this.recoverIfStuck(dt, mazeData, cellSize);
      this.updateDOM();
      return;
    }

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
        distToPlayer > this.alertRadius * 8 ||
        Math.hypot(this.x - this.guardAnchor.x, this.y - this.guardAnchor.y) > this.maxChaseDistanceFromGuard
      ) {
        // v0.5.17：原本 1.5 倍偵測距離的即時放棄門檻太小（約217px），玩家往出口衝刺時幾乎瞬間就會觸發，
        // 導致完全用不到守護區錨點那個更大的範圍——這才是「拿到 Pulse 後反派不追」的真正原因。
        // v0.5.17 改成 4 倍（約580px）還是比 maxChaseDistanceFromGuard(950px) 小，即時距離判定還是搶先觸發，
        // 守護錨點範圍實際上從未真正生效過，這才是「追到一半突然放棄」的真正原因。
        // v0.5.26：把即時放棄距離拉高到 8 倍（約1160px），確保比守護錨點範圍(950px)更寬鬆，
        // 讓守護錨點才是真正決定放棄的邊界，即時距離只作為極端情況的保險，不再搶先觸發。
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

    this.recoverIfStuck(dt, mazeData, cellSize);
    this.updateDOM();
  },

  updatePatrol: function(dt, mazeData, cellSize) {
    if (!this.currentTarget) return;
    if (Math.hypot(this.currentTarget.x - this.x, this.currentTarget.y - this.y) < 6) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolRoute.length;
      this.currentTarget = this.patrolRoute[this.patrolIndex];
    }
    const targetCell = this.toCell(this.currentTarget, cellSize);
    const path = this.findPathToCell(targetCell, mazeData, cellSize, this.pathSearchLimit);
    const target = this.getPathStepTarget(path, this.currentTarget, cellSize);
    this.moveToward(target, this.patrolSpeed, dt, mazeData, cellSize, true);
  },

  // 搜索：走向玩家最後已知位置附近，不是精準導航，到了就地徘徊直到 searchTimer 結束
  updateSearch: function(dt, mazeData, cellSize) {
    if (!this.lastKnownCell) return;
    const path = this.findPathToCell(this.lastKnownCell, mazeData, cellSize, this.pathSearchLimit);
    const target = this.getPathStepTarget(path, this.cellCenter(this.lastKnownCell, cellSize), cellSize);
    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    if (dist < 8) return;
    this.moveToward(target, this.patrolSpeed * 1.05, dt, mazeData, cellSize, true);
  },

  // v0.5.27：追逐時真正沿 BFS 下一格走，避免 Core Pulse 後玩家拉長距離、
  // EMBER 直線撞牆卡在角落。找不到玩家路徑時才追最後記憶格。
  updatePathChase: function(playerPos, pathToPlayer, dt, mazeData, cellSize) {
    const memoryStep = pathToPlayer ? null : this.chooseMemoryStep(mazeData, cellSize);
    let target = playerPos;

    if (pathToPlayer && pathToPlayer.length > 0) {
      target = this.getPathStepTarget(pathToPlayer, playerPos, cellSize);
    } else if (memoryStep) {
      const start = this.toCell({ x: this.x, y: this.y }, cellSize);
      target = this.cellCenter({ x: start.x + memoryStep.x, y: start.y + memoryStep.y }, cellSize);
    }

    this.moveToward(target, this.chaseSpeed, dt, mazeData, cellSize, true);
  },

  getPathStepTarget: function(path, fallbackTarget, cellSize) {
    if (!path || path.length === 0) return fallbackTarget;
    const start = this.toCell({ x: this.x, y: this.y }, cellSize);
    const next = { x: start.x + path[0].x, y: start.y + path[0].y };
    return this.cellCenter(next, cellSize);
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

  recoverIfStuck: function(dt, mazeData, cellSize) {
    if (this.state !== 'chase' && this.state !== 'search') {
      this.stuckTimer = 0;
      this.lastMoveX = this.x;
      this.lastMoveY = this.y;
      return;
    }

    const moved = Math.hypot(this.x - this.lastMoveX, this.y - this.lastMoveY);
    this.lastMoveX = this.x;
    this.lastMoveY = this.y;

    if (moved > 0.18) {
      this.stuckTimer = 0;
      return;
    }

    this.stuckTimer += dt;
    if (this.stuckTimer < 420) return;

    const safeCenter = this.findNearestOpenCenter(mazeData, cellSize);
    if (safeCenter) {
      this.x = safeCenter.x;
      this.y = safeCenter.y;
      this.lastMoveX = this.x;
      this.lastMoveY = this.y;
    }
    this.stuckTimer = 0;
  },

  findNearestOpenCenter: function(mazeData, cellSize) {
    const origin = this.toCell({ x: this.x, y: this.y }, cellSize);
    const queue = [origin];
    const visited = new Set([`${origin.x},${origin.y}`]);

    while (queue.length > 0) {
      const cell = queue.shift();
      if (!this.isWall(cell.x, cell.y, mazeData)) return this.cellCenter(cell, cellSize);

      const dirs = [
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
      ];
      for (const dir of dirs) {
        const next = { x: cell.x + dir.x, y: cell.y + dir.y };
        const key = `${next.x},${next.y}`;
        if (visited.has(key)) continue;
        if (next.y < 0 || next.y >= mazeData.length || next.x < 0 || next.x >= mazeData[0].length) continue;
        visited.add(key);
        queue.push(next);
      }
    }

    return null;
  },

  updateSiphon: function(playerPos, isPlayerHidden, dt, mazeData, cellSize) {
    const distToPlayer = Math.hypot(playerPos.x - this.x, playerPos.y - this.y);
    const pathToPlayer = isPlayerHidden
      ? null
      : this.findPathToPlayer(playerPos, mazeData, cellSize, this.pathSearchLimit);
    const pathDistance = pathToPlayer ? pathToPlayer.length : Infinity;

    if (!isPlayerHidden && pathToPlayer) {
      this.lastKnownCell = this.toCell(playerPos, cellSize);
      this.chaseMemoryTimer = this.chaseMemoryDuration;
    } else if (this.chaseMemoryTimer > 0) {
      this.chaseMemoryTimer -= dt;
    }

    if (this.state === 'patrol') {
      if (!isPlayerHidden && distToPlayer < this.alertRadius) {
        this.state = 'chase';
        this.chaseTimer = this.chaseDuration;
        FX.toggleGlobalAlert(true);
      } else if (!isPlayerHidden && pathDistance <= this.pathAlertLimit * 1.5) {
        this.state = 'observe';
        this.observeTimer = 400;
      }
    } else if (this.state === 'observe') {
      if (isPlayerHidden) {
        this.state = 'patrol';
      } else if (distToPlayer < this.alertRadius) {
        this.state = 'chase';
        this.chaseTimer = this.chaseDuration;
        FX.toggleGlobalAlert(true);
      } else {
        this.observeTimer -= dt;
        if (this.observeTimer <= 0) {
          this.state = 'intercept';
          this.interceptTarget = this.predictPlayerJunction(playerPos, mazeData, cellSize);
          this.interceptTimer = 4000;
        }
      }
    } else if (this.state === 'intercept') {
      if (isPlayerHidden) {
        this.state = 'search';
        this.searchTimer = this.searchDuration;
      } else if (distToPlayer < this.alertRadius) {
        this.state = 'chase';
        this.chaseTimer = this.chaseDuration;
        FX.toggleGlobalAlert(true);
      } else {
        this.interceptTimer -= dt;
        if (this.interceptTimer <= 0 || this.reachedCell(this.interceptTarget, cellSize)) {
          this.state = 'search';
          this.searchTimer = this.searchDuration;
        }
      }
    } else if (this.state === 'chase') {
      if (isPlayerHidden || distToPlayer > this.alertRadius * 8) {
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
      if (!isPlayerHidden && (pathDistance <= this.pathAlertLimit || distToPlayer < this.alertRadius)) {
        this.state = 'chase';
        this.chaseTimer = this.chaseDuration;
        FX.toggleGlobalAlert(true);
      } else {
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) this.state = 'return';
      }
    } else if (this.state === 'return') {
      if (!isPlayerHidden && (pathDistance <= this.pathAlertLimit || distToPlayer < this.alertRadius)) {
        this.state = 'chase';
        this.chaseTimer = this.chaseDuration;
        FX.toggleGlobalAlert(true);
      } else if (
        this.currentTarget &&
        Math.hypot(this.currentTarget.x - this.x, this.currentTarget.y - this.y) < 6
      ) {
        this.state = 'patrol';
      }
    } else {
      this.state = 'patrol';
    }

    if (this.state === 'patrol') {
      this.updatePatrol(dt, mazeData, cellSize);
    } else if (this.state === 'observe') {
      // 原地觀察，避免尚未選定攔截點就漂移。
    } else if (this.state === 'intercept') {
      const path = this.findPathToCell(this.interceptTarget, mazeData, cellSize, 64);
      const target = this.getPathStepTarget(
        path,
        this.cellCenter(this.interceptTarget, cellSize),
        cellSize
      );
      this.moveToward(target, this.patrolSpeed * 1.1, dt, mazeData, cellSize, true);
    } else if (this.state === 'chase') {
      this.updatePathChase(playerPos, pathToPlayer, dt, mazeData, cellSize);
    } else if (this.state === 'search') {
      this.updateSearch(dt, mazeData, cellSize);
    } else if (this.state === 'return') {
      const targetCell = this.toCell(this.currentTarget, cellSize);
      const path = this.findPathToCell(targetCell, mazeData, cellSize, 64);
      const target = this.getPathStepTarget(path, this.currentTarget, cellSize);
      this.moveToward(target, this.patrolSpeed, dt, mazeData, cellSize, true);
    }
  },

  predictPlayerJunction: function(playerPos, mazeData, cellSize) {
    const playerCell = this.toCell(playerPos, cellSize);
    const junctions = mazeData.metadata?.junctions || [];
    let closest = null;
    let minDistance = Infinity;
    for (const junction of junctions) {
      const distance = Math.hypot(junction.x - playerCell.x, junction.y - playerCell.y);
      if (distance < minDistance && distance > 2) {
        minDistance = distance;
        closest = junction;
      }
    }
    return closest || playerCell;
  },

  reachedCell: function(target, cellSize) {
    if (!target) return true;
    const center = this.cellCenter(target, cellSize);
    return Math.hypot(this.x - center.x, this.y - center.y) < 8;
  },

  updateDOM: function() {
    this.domElement.style.left = `${this.x}px`;
    this.domElement.style.top = `${this.y}px`;
    const typeClass = this.type.replace(/([A-Z])/g, '-$1').toLowerCase();
    this.spriteElement.className = `actor-sprite enemy-state-${this.state} ${typeClass}`;
  }
};
