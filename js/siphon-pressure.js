// Stage 03 SIPHON pressure controller.
// Loaded after enemy.js so EMBER and the protected EnemyLogic source stay untouched.
const SiphonPressure = {
  tuning: Object.freeze({
    playerSpeed: 4.2,
    guardPatrolSpeed: 1.45,
    guardInterceptSpeed: 2.55,
    guardChaseSpeed: 3.15,
    huntChaseSpeed: 3.15,
    huntInterceptSpeed: 3.05,
    huntSearchSpeed: 2.60,
    perceptionInterval: 200,
    chasePathInterval: 250,
    interceptInterval: 475,
    interceptCooldown: 1200,
    observeDuration: 300,
    guardHoldLimit: 900,
    huntMemoryDuration: 8000,
    huntSearchDuration: 6500
  }),

  huntActive: false,
  phase: 'guard_patrol',
  phaseTimer: 0,
  holdTimer: 0,
  interceptCooldownTimer: 0,
  interceptTarget: null,
  lastInterceptKey: null,
  repeatedIntercepts: 0,
  lastKnownCell: null,
  lastPlayerCell: null,
  lastPlayerDirection: null,
  chaseMemoryTimer: 0,
  searchTimer: 0,
  perceptionElapsed: Infinity,
  interceptElapsed: Infinity,
  pathElapsed: Infinity,
  cachedPlayerPath: null,
  cachedStepTarget: null,
  cachedStepKey: '',
  debugBfsRuns: 0,

  reset() {
    this.huntActive = false;
    this.phase = 'guard_patrol';
    this.phaseTimer = 0;
    this.holdTimer = 0;
    this.interceptCooldownTimer = 0;
    this.interceptTarget = null;
    this.lastInterceptKey = null;
    this.repeatedIntercepts = 0;
    this.lastKnownCell = null;
    this.lastPlayerCell = null;
    this.lastPlayerDirection = null;
    this.chaseMemoryTimer = 0;
    this.searchTimer = 0;
    this.perceptionElapsed = Infinity;
    this.interceptElapsed = Infinity;
    this.pathElapsed = Infinity;
    this.cachedPlayerPath = null;
    this.cachedStepTarget = null;
    this.cachedStepKey = '';
    this.debugBfsRuns = 0;
  },

  snapshot() {
    return {
      huntActive: this.huntActive,
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      holdTimer: this.holdTimer,
      interceptCooldownTimer: this.interceptCooldownTimer,
      interceptTarget: this.interceptTarget,
      lastInterceptKey: this.lastInterceptKey,
      repeatedIntercepts: this.repeatedIntercepts,
      lastKnownCell: this.lastKnownCell,
      lastPlayerCell: this.lastPlayerCell,
      lastPlayerDirection: this.lastPlayerDirection,
      chaseMemoryTimer: this.chaseMemoryTimer,
      searchTimer: this.searchTimer
    };
  },

  restore(snapshot) {
    if (!snapshot) return;
    this.huntActive = Boolean(snapshot.huntActive);
    this.phase = snapshot.phase || (this.huntActive ? 'hunt_acquire' : 'guard_patrol');
    this.phaseTimer = snapshot.phaseTimer || 0;
    this.holdTimer = snapshot.holdTimer || 0;
    this.interceptCooldownTimer = snapshot.interceptCooldownTimer || 0;
    this.interceptTarget = snapshot.interceptTarget || null;
    this.lastInterceptKey = snapshot.lastInterceptKey || null;
    this.repeatedIntercepts = snapshot.repeatedIntercepts || 0;
    this.lastKnownCell = snapshot.lastKnownCell || null;
    this.lastPlayerCell = snapshot.lastPlayerCell || null;
    this.lastPlayerDirection = snapshot.lastPlayerDirection || null;
    this.chaseMemoryTimer = snapshot.chaseMemoryTimer || 0;
    this.searchTimer = snapshot.searchTimer || 0;
    this.perceptionElapsed = Infinity;
    this.interceptElapsed = Infinity;
    this.pathElapsed = Infinity;
    this.cachedStepKey = '';
  },

  setPlayerContext(context) {
    if (!context?.playerPos || !context.cellSize) return;
    const cell = {
      x: Math.floor(context.playerPos.x / context.cellSize),
      y: Math.floor(context.playerPos.y / context.cellSize)
    };
    const supplied = this.normalizeDirection(context.direction);
    if (supplied) {
      this.lastPlayerDirection = supplied;
    } else if (
      this.lastPlayerCell &&
      (cell.x !== this.lastPlayerCell.x || cell.y !== this.lastPlayerCell.y)
    ) {
      this.lastPlayerDirection = this.normalizeDirection({
        x: cell.x - this.lastPlayerCell.x,
        y: cell.y - this.lastPlayerCell.y
      });
    }
    this.lastPlayerCell = cell;
  },

  armHunt(context) {
    this.huntActive = true;
    this.phase = 'hunt_acquire';
    this.phaseTimer = 0;
    this.holdTimer = 0;
    this.interceptCooldownTimer = 0;
    this.interceptTarget = null;
    this.searchTimer = this.tuning.huntSearchDuration;
    this.chaseMemoryTimer = this.tuning.huntMemoryDuration;
    this.interceptElapsed = Infinity;
    this.pathElapsed = Infinity;
    if (context) this.setPlayerContext(context);
    if (this.lastPlayerCell) this.lastKnownCell = { ...this.lastPlayerCell };
  },

  normalizeDirection(direction) {
    if (!direction) return null;
    const x = Number(direction.x || 0);
    const y = Number(direction.y || 0);
    if (x === 0 && y === 0) return null;
    return Math.abs(x) >= Math.abs(y)
      ? { x: Math.sign(x), y: 0 }
      : { x: 0, y: Math.sign(y) };
  },

  visualStateForPhase() {
    if (this.phase.includes('chase')) return 'chase';
    if (this.phase.includes('search') || this.phase.includes('reacquire')) return 'search';
    if (this.phase.includes('observe') || this.phase.includes('intercept') || this.phase.includes('acquire')) {
      return 'alert';
    }
    return 'patrol';
  },

  isWalkable(map, x, y) {
    const value = map[y]?.[x];
    return value !== undefined && value !== 0 && value !== 6;
  },

  walkableDegree(map, x, y) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .filter(([dx, dy]) => this.isWalkable(map, x + dx, y + dy)).length;
  },

  buildDistanceMap(map, start) {
    this.debugBfsRuns++;
    const height = map.length;
    const width = map[0].length;
    const distance = Array.from({ length: height }, () => Array(width).fill(Infinity));
    const firstStep = Array.from({ length: height }, () => Array(width).fill(null));
    if (!this.isWalkable(map, start.x, start.y)) return { distance, firstStep };
    const queue = [start];
    distance[start.y][start.x] = 0;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = current.x + dx;
        const y = current.y + dy;
        if (!this.isWalkable(map, x, y) || distance[y][x] !== Infinity) continue;
        distance[y][x] = distance[current.y][current.x] + 1;
        firstStep[y][x] = distance[current.y][current.x] === 0
          ? { x: dx, y: dy }
          : firstStep[current.y][current.x];
        queue.push({ x, y });
      }
    }
    return { distance, firstStep };
  },

  chooseIntercept(enemy, playerCell, map, speed, force = false) {
    if (!force && this.interceptCooldownTimer > 0 && this.interceptTarget) {
      return this.interceptTarget;
    }
    const junctions = map.metadata?.junctions || [];
    const enemyCell = enemy.toCell({ x: enemy.x, y: enemy.y }, 50);
    this.debugBfsRuns = 0;
    const fromPlayer = this.buildDistanceMap(map, playerCell);
    const fromEnemy = this.buildDistanceMap(map, enemyCell);
    const heading = this.lastPlayerDirection || { x: 0, y: 1 };
    let best = null;

    for (const junction of junctions) {
      if (!this.isWalkable(map, junction.x, junction.y)) continue;
      const playerPath = fromPlayer.distance[junction.y][junction.x];
      const enemyPath = fromEnemy.distance[junction.y][junction.x];
      if (!Number.isFinite(playerPath) || !Number.isFinite(enemyPath)) continue;
      if (playerPath < 4 || playerPath > 14) continue;
      if (this.walkableDegree(map, junction.x, junction.y) < 3) continue;
      if (junction.y >= map.length - 2) continue;

      const first = fromPlayer.firstStep[junction.y][junction.x];
      const alignment = first ? first.x * heading.x + first.y * heading.y : 0;
      const directHeading = (
        Math.sign(junction.x - playerCell.x) * heading.x +
        Math.sign(junction.y - playerCell.y) * heading.y
      );
      if (alignment < 0 && directHeading < 0) continue;

      const playerETA = playerPath / this.tuning.playerSpeed;
      const enemyETA = enemyPath / speed;
      const lead = playerETA - enemyETA;
      const feasibleLead = Math.max(0, 1 - Math.abs(lead - 0.75) / 1.75);
      const headingAlignment = alignment > 0 ? 1 : (directHeading > 0 ? 0.55 : 0.2);
      const degree = this.walkableDegree(map, junction.x, junction.y);
      const routeCutValue = Math.min(1, (degree - 2) / 2);
      const strategicWeight = 1 - Math.min(1, Math.abs(junction.y - 19) / map.length);
      const key = `${junction.x},${junction.y}`;
      const repeatedPenalty = key === this.lastInterceptKey ? this.repeatedIntercepts / 2 : 0;
      const behindPenalty = directHeading < 0 ? 1 : 0;
      const chokePenalty = degree < 3 ? 1 : 0;
      const score =
        35 * headingAlignment +
        30 * feasibleLead +
        20 * routeCutValue +
        10 * strategicWeight -
        25 * behindPenalty -
        30 * chokePenalty -
        15 * repeatedPenalty;

      if (!best || score > best.score) {
        best = { target: { x: junction.x, y: junction.y }, score, playerETA, enemyETA };
      }
    }

    if (!best) return null;
    const key = `${best.target.x},${best.target.y}`;
    this.repeatedIntercepts = key === this.lastInterceptKey ? this.repeatedIntercepts + 1 : 1;
    if (this.repeatedIntercepts > 2) return null;
    this.lastInterceptKey = key;
    this.interceptCooldownTimer = this.tuning.interceptCooldown;
    return best.target;
  },

  chooseGuardEntrance(playerCell) {
    const heading = this.lastPlayerDirection || { x: 0, y: 1 };
    if (heading.y < 0) return { x: 7, y: 22 };
    if (heading.y > 0) return { x: 7, y: 16 };
    return Math.abs(playerCell.y - 16) <= Math.abs(playerCell.y - 22)
      ? { x: 7, y: 16 }
      : { x: 7, y: 22 };
  },

  refreshPlayerPath(enemy, playerCell, map, cellSize, force = false) {
    if (!force && this.perceptionElapsed < this.tuning.perceptionInterval) {
      return this.cachedPlayerPath;
    }
    this.perceptionElapsed = 0;
    this.cachedPlayerPath = enemy.findPathToCell(
      playerCell,
      map,
      cellSize,
      enemy.pathSearchLimit
    );
    return this.cachedPlayerPath;
  },

  moveToCell(enemy, targetCell, speed, dt, map, cellSize) {
    if (!targetCell || !this.isWalkable(map, targetCell.x, targetCell.y)) return false;
    const start = enemy.toCell({ x: enemy.x, y: enemy.y }, cellSize);
    const key = `${start.x},${start.y}>${targetCell.x},${targetCell.y}`;
    if (
      this.pathElapsed >= this.tuning.chasePathInterval ||
      this.cachedStepKey !== key ||
      !this.cachedStepTarget
    ) {
      const path = enemy.findPathToCell(targetCell, map, cellSize, enemy.pathSearchLimit);
      this.cachedStepTarget = enemy.getPathStepTarget(
        path,
        enemy.cellCenter(targetCell, cellSize),
        cellSize
      );
      this.cachedStepKey = key;
      this.pathElapsed = 0;
    }
    enemy.moveToward(this.cachedStepTarget, speed, dt, map, cellSize, true);
    return enemy.reachedCell(targetCell, cellSize);
  },

  update(enemy, playerPos, hidden, dt, map, cellSize) {
    this.perceptionElapsed += dt;
    this.interceptElapsed += dt;
    this.pathElapsed += dt;
    this.phaseTimer += dt;
    this.interceptCooldownTimer = Math.max(0, this.interceptCooldownTimer - dt);
    this.chaseMemoryTimer = Math.max(0, this.chaseMemoryTimer - dt);
    this.setPlayerContext({
      playerPos,
      cellSize,
      direction: this.lastPlayerDirection
    });

    const playerCell = enemy.toCell(playerPos, cellSize);
    const path = hidden ? null : this.refreshPlayerPath(enemy, playerCell, map, cellSize);
    const pathDistance = path ? path.length : Infinity;
    const pixelDistance = Math.hypot(playerPos.x - enemy.x, playerPos.y - enemy.y);
    if (!hidden && (this.huntActive || pathDistance <= enemy.pathAlertLimit)) {
      this.lastKnownCell = { ...playerCell };
      this.chaseMemoryTimer = this.huntActive
        ? this.tuning.huntMemoryDuration
        : enemy.chaseMemoryDuration;
    }

    if (!this.huntActive) {
      this.updateGuard(enemy, playerCell, hidden, pathDistance, pixelDistance, dt, map, cellSize);
    } else {
      this.updateHunt(enemy, playerCell, hidden, pathDistance, pixelDistance, dt, map, cellSize);
    }
    // EnemyLogic 的既有卡牆復原與視覺樣式只認得 patrol/alert/chase/search；
    // 專項 phase 留在本模組，對外維持舊狀態名稱以保留復原機制。
    enemy.state = this.visualStateForPhase();
  },

  updateGuard(enemy, playerCell, hidden, pathDistance, pixelDistance, dt, map, cellSize) {
    if (hidden) {
      this.phase = 'guard_search';
      this.searchTimer = Math.max(this.searchTimer, enemy.searchDuration);
    }

    if (this.phase === 'guard_patrol') {
      if (!hidden && (pixelDistance < enemy.alertRadius || pathDistance <= 4)) {
        this.phase = 'guard_chase';
        this.phaseTimer = 0;
        FX.toggleGlobalAlert(true);
      } else if (!hidden && pathDistance <= enemy.pathAlertLimit) {
        this.phase = 'guard_observe';
        this.phaseTimer = 0;
      } else {
        enemy.updatePatrol(dt, map, cellSize);
      }
      return;
    }

    if (this.phase === 'guard_observe') {
      if (hidden) {
        this.phase = 'guard_search';
        this.searchTimer = enemy.searchDuration;
      } else if (this.phaseTimer >= this.tuning.observeDuration) {
        this.interceptTarget = this.chooseGuardEntrance(playerCell);
        this.phase = 'guard_intercept';
        this.phaseTimer = 0;
        this.holdTimer = 0;
      }
      return;
    }

    if (this.phase === 'guard_intercept') {
      if (!hidden && (pixelDistance < enemy.alertRadius || pathDistance <= 4)) {
        this.phase = 'guard_chase';
        this.phaseTimer = 0;
        FX.toggleGlobalAlert(true);
        return;
      }
      const reached = this.moveToCell(
        enemy,
        this.interceptTarget,
        this.tuning.guardInterceptSpeed,
        dt,
        map,
        cellSize
      );
      this.holdTimer = reached ? this.holdTimer + dt : 0;
      if (this.holdTimer >= this.tuning.guardHoldLimit) {
        this.interceptTarget = this.interceptTarget?.y === 16
          ? { x: 7, y: 22 }
          : { x: 7, y: 16 };
        this.holdTimer = 0;
      }
      return;
    }

    if (this.phase === 'guard_chase') {
      if (hidden || (pathDistance > enemy.pathAlertLimit * 1.5 && pixelDistance > enemy.alertRadius * 2)) {
        this.phase = 'guard_search';
        this.searchTimer = enemy.searchDuration;
        FX.toggleGlobalAlert(false);
      } else {
        this.moveToCell(enemy, playerCell, this.tuning.guardChaseSpeed, dt, map, cellSize);
      }
      return;
    }

    if (this.phase === 'guard_search') {
      this.searchTimer -= dt;
      if (this.lastKnownCell) {
        this.moveToCell(enemy, this.lastKnownCell, this.tuning.guardPatrolSpeed, dt, map, cellSize);
      }
      if (!hidden && pathDistance <= enemy.pathAlertLimit) {
        this.phase = 'guard_chase';
        FX.toggleGlobalAlert(true);
      } else if (this.searchTimer <= 0) {
        this.phase = 'guard_patrol';
      }
    }
  },

  updateHunt(enemy, playerCell, hidden, pathDistance, pixelDistance, dt, map, cellSize) {
    if (this.phase === 'hunt_acquire') {
      this.interceptTarget = this.chooseIntercept(
        enemy,
        playerCell,
        map,
        this.tuning.huntInterceptSpeed,
        true
      );
      this.phase = this.interceptTarget ? 'hunt_intercept' : 'hunt_chase';
      this.phaseTimer = 0;
      this.holdTimer = 0;
      FX.toggleGlobalAlert(true);
      return;
    }

    if (hidden) {
      this.phase = 'hunt_search';
      this.searchTimer = this.tuning.huntSearchDuration;
    }

    if (this.phase === 'hunt_intercept') {
      if (!hidden && (pixelDistance < enemy.alertRadius || pathDistance <= 5)) {
        this.phase = 'hunt_chase';
        this.phaseTimer = 0;
        return;
      }
      const reached = this.moveToCell(
        enemy,
        this.interceptTarget,
        this.tuning.huntInterceptSpeed,
        dt,
        map,
        cellSize
      );
      this.holdTimer = reached ? this.holdTimer + dt : 0;
      if (
        this.holdTimer >= this.tuning.guardHoldLimit ||
        this.interceptElapsed >= this.tuning.interceptInterval
      ) {
        this.interceptElapsed = 0;
        const next = this.chooseIntercept(
          enemy,
          playerCell,
          map,
          this.tuning.huntInterceptSpeed
        );
        if (next) this.interceptTarget = next;
        else this.phase = 'hunt_chase';
      }
      return;
    }

    if (this.phase === 'hunt_chase') {
      if (hidden) {
        this.phase = 'hunt_search';
        this.searchTimer = this.tuning.huntSearchDuration;
      } else {
        this.moveToCell(enemy, playerCell, this.tuning.huntChaseSpeed, dt, map, cellSize);
        if (pathDistance > 12 && this.interceptElapsed >= this.tuning.interceptInterval) {
          this.interceptElapsed = 0;
          const target = this.chooseIntercept(
            enemy,
            playerCell,
            map,
            this.tuning.huntInterceptSpeed
          );
          if (target) {
            this.interceptTarget = target;
            this.phase = 'hunt_intercept';
          }
        }
      }
      return;
    }

    if (this.phase === 'hunt_search') {
      this.searchTimer -= dt;
      if (!hidden && pathDistance <= enemy.pathAlertLimit) {
        this.phase = 'hunt_chase';
        this.searchTimer = this.tuning.huntSearchDuration;
        return;
      }
      if (this.lastKnownCell) {
        this.moveToCell(
          enemy,
          this.lastKnownCell,
          this.tuning.huntSearchSpeed,
          dt,
          map,
          cellSize
        );
      }
      if (this.searchTimer <= 0 || this.chaseMemoryTimer <= 0) {
        this.phase = 'hunt_reacquire';
        this.phaseTimer = 0;
      }
      return;
    }

    if (this.phase === 'hunt_reacquire') {
      const target = this.chooseIntercept(
        enemy,
        playerCell,
        map,
        this.tuning.huntInterceptSpeed,
        true
      );
      if (target) {
        this.interceptTarget = target;
        this.phase = 'hunt_intercept';
      } else if (this.lastKnownCell) {
        this.moveToCell(
          enemy,
          this.lastKnownCell,
          this.tuning.huntSearchSpeed,
          dt,
          map,
          cellSize
        );
      }
      return;
    }

    // A restored or stale Stage 03 state can never fall back to the legacy return/patrol loop.
    this.phase = 'hunt_acquire';
  },

  _debugChooseIntercept(enemy, playerCell, map, speed) {
    const target = this.chooseIntercept(enemy, playerCell, map, speed, true);
    return { target, bfsRuns: this.debugBfsRuns };
  }
};

EnemyLogic.updateSiphon = function(playerPos, hidden, dt, mazeData, cellSize) {
  SiphonPressure.update(this, playerPos, hidden, dt, mazeData, cellSize);
};

globalThis.SiphonPressure = SiphonPressure;
