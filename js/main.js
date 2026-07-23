// js/main.js
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  ControlLogic.init();
  CameraLogic.init();

  const CELL_SIZE = Render3D.CELL_SIZE;
  const PLAYER_RADIUS = 21;
  const RAIL_NODE_EPSILON = 0.05;
  // Stage 03 has denser legal turns. Give mobile gestures a slightly earlier,
  // longer target-bound window without changing the shared v0.10.5 control core.
  // The target remains fixed, so an intent can never drift to a later junction.
  const STAGE_03_TURN_TARGET_LOOKAHEAD_PX = 85;
  const STAGE_03_TURN_TARGET_MAX_AGE_MS = 700;
  const STAGE_03_TURN_TARGET_GRACE_PX = 24;
  let baseSpeed = 4.2;
  let currentSpeed = baseSpeed;
  let isGameOver = false;
  let isResetting = false;
  let hasGameStarted = false;
  let backGuardArmed = false;
  let lastTime = performance.now();
  let lastTrailTime = 0;
  const TRAIL_INTERVAL = 90; // v0.5.24：動能軌跡節流間隔(ms)，避免每個 frame 都生成殘光點
  const MAX_FRAME_DT = 34; // Core Pulse 觸發後若掉幀，限制單幀補位，避免主角/反派瞬間跳格
  const PULSE_EFFECT_DURATION = 2400; // v0.9.0：兩關共用五段式線性充電序列
  const RUN_STATE_KEY = 'coreo-dark-run-state-v7'; // v0.10.1 無介面離散滑動控制
  let pulseEffectUntil = 0;
  let pulseEffectTimer = null;
  let stage03Memory = {
    visitedCells: new Set(),
    enteredBranches: new Set(),
    resolvedBranches: new Set(),
    rejectedBranches: new Set(),
    lastDecisionJunction: null
  };
  let currentBranchId = null;

  // v0.5.14: Core Shard / Core Pulse 資源規則（GPT 裁決）
  const SHARDS_PER_PULSE = 5;
  let shardCount = 0;
  let pulseCount = 0;
  const hudShardVal = document.getElementById('ui-shard-val');
  const hudPulseVal = document.getElementById('ui-pulse-val');

  // v0.8.3：HUD 在 DOM 上跟 #world 是手足節點，沒辦法用 .stage-02 後代選擇器涵蓋，
  // 這裡直接依 currentStage 切換 class 名稱，讓 Stage02 走冷白/冰青版本、Stage01 維持原本黃綠閃光
  function flashHud(el) {
    if (!el) return;
    const glowClass = currentStage === 3 ? 'glow-s3' : (currentStage === 2 ? 'glow-s2' : 'glow');
    el.classList.add(glowClass);
    setTimeout(() => el.classList.remove(glowClass), 200);
  }

  function applyStageBodyClasses(stageId) {
    document.body.classList.toggle('stage-02-active', stageId === 2);
    document.body.classList.toggle('stage-03-active', stageId === 3);
  }

  function buildDistanceMap(startX, startY) {
    const distances = mazeData.map((row) => row.map(() => -1));
    if (!mazeData[startY] || mazeData[startY][startX] === 0) return distances;
    const queue = [{ x: startX, y: startY }];
    distances[startY][startX] = 0;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (!mazeData[ny] || mazeData[ny][nx] === 0 || distances[ny][nx] !== -1) continue;
        distances[ny][nx] = distances[current.y][current.x] + 1;
        queue.push({ x: nx, y: ny });
      }
    }
    return distances;
  }

  // v0.9.0：兩關共用真正沿可走拓撲傳導的五段式線性充電序列。
  // 路徑仍使用既有貪婪合併 DOM；只以 data-grid 座標分組並切換 opacity，避免逐格 box-shadow。
  function energizeMatrix() {
    const worldEl = document.getElementById('world');
    if (!worldEl) return;

    const px = Math.floor(playerPos.x / CELL_SIZE);
    const py = Math.floor(playerPos.y / CELL_SIZE);
    const fromPlayer = buildDistanceMap(px, py);
    let exit = null;
    for (let y = 0; y < mazeData.length; y++) {
      const x = mazeData[y].indexOf(3);
      if (x !== -1) { exit = { x, y }; break; }
    }
    const fromExit = exit ? buildDistanceMap(exit.x, exit.y) : null;
    const playerToExit = exit ? fromExit[py][px] : -1;
    const pathBlocks = Array.from(worldEl.querySelectorAll('.cell.path'));
    const eligible = [];

    for (const block of pathBlocks) {
      block.classList.remove('pulse-wave-1', 'pulse-wave-2', 'pulse-wave-3', 'pulse-wave-4', 'pulse-wave-5');
      const x = Number(block.dataset.gridX);
      const y = Number(block.dataset.gridY);
      const distance = fromPlayer[y]?.[x] ?? -1;
      if (distance < 0) continue;
      if (currentStage === 1 && playerToExit >= 0 && (fromExit[y]?.[x] ?? Infinity) > playerToExit + 1) continue;
      eligible.push({ block, distance });
    }

    const maxDistance = Math.max(1, ...eligible.map((item) => item.distance));
    for (const { block, distance } of eligible) {
      const wave = Math.min(5, Math.floor((distance / (maxDistance + 1)) * 5) + 1);
      block.classList.add(`pulse-wave-${wave}`);
    }

    worldEl.classList.remove('circuit-pulse');
    void worldEl.offsetWidth;
    worldEl.classList.add('circuit-pulse');
    if (pulseEffectTimer) clearTimeout(pulseEffectTimer);
    pulseEffectTimer = setTimeout(() => {
      worldEl.classList.remove('circuit-pulse');
      pulseEffectTimer = null;
    }, PULSE_EFFECT_DURATION);
    pulseEffectUntil = performance.now() + PULSE_EFFECT_DURATION;
  }

  function isPulseEffectActive(time = performance.now()) {
    return time < pulseEffectUntil;
  }

  // v0.6：Stage 02 多關卡設定物件，兩關的地圖／巡邏路線／通關門檻／簡報文案在此集中管理，
  // 不做成完整資料驅動引擎，兩關規模用這個簡化物件就夠
  const STAGE_CONFIG = {
    1: {
      getMap: () => MazeLogic.getStage01Map(),
      enemyRoute: [
        { x: 1.5 * CELL_SIZE, y: 21.5 * CELL_SIZE },
        { x: 1.5 * CELL_SIZE, y: 20.5 * CELL_SIZE },
        { x: 1.5 * CELL_SIZE, y: 19.5 * CELL_SIZE },
        { x: 1.5 * CELL_SIZE, y: 18.5 * CELL_SIZE },
        { x: 1.5 * CELL_SIZE, y: 17.5 * CELL_SIZE },
        { x: 2.5 * CELL_SIZE, y: 17.5 * CELL_SIZE },
        { x: 1.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }
      ],
      enemyTuning: {
        baseAlertRadius: 145,
        pathAlertLimit: 7,
        patrolSpeed: 0.62,
        chaseSpeed: 1.30,
        chaseDuration: 11000,
        maxChaseDistanceFromGuard: 950
      },
      pulseRequirement: 1,
      exitDirection: 'down',
      cameraAnchorRatio: 0.12,
      briefing: {
        title: 'STAGE 01 | CORE AWAKENING',
        subtitle: '第一關｜核心甦醒',
        shardRule: '收集 5 個，可形成 1 個 Core Pulse。',
        pulseRule: '出口需要 1 個；可由碎片形成，或直接取得。',
        mission: '收集 5 個碎片，或取得菱形 Core Pulse；避開 EMBER，啟動下方出口。',
        btnText: 'ENTER STAGE 01'
      }
    },
    2: {
      getMap: () => MazeLogic.getStage02Map(),
      // v0.9.0：巡邏點全部落在可走格，依序咬住 Hub、Vault 主入口、核心、Lure 與回程壓力區。
      enemyRoute: [
        { x: 4.5 * CELL_SIZE, y: 11.5 * CELL_SIZE }, // Hub 咽喉
        { x: 4.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }, // Vault 主入口
        { x: 4.5 * CELL_SIZE, y: 19.5 * CELL_SIZE }, // Vault 內側
        { x: 5.5 * CELL_SIZE, y: 22.5 * CELL_SIZE }, // 狹窄逃生口
        { x: 7.5 * CELL_SIZE, y: 21.5 * CELL_SIZE }, // Lure 下段
        { x: 4.5 * CELL_SIZE, y: 24.5 * CELL_SIZE }, // 下交會核心
        { x: 4.5 * CELL_SIZE, y: 26.5 * CELL_SIZE }, // 回程分流
        { x: 3.5 * CELL_SIZE, y: 29.5 * CELL_SIZE }, // 回程 Z 字壓力點
        { x: 1.5 * CELL_SIZE, y: 24.5 * CELL_SIZE }, // Bypass 下口
        { x: 1.5 * CELL_SIZE, y: 21.5 * CELL_SIZE }, // Bypass 中段
        { x: 1.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }, // Bypass 上口
        { x: 4.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }  // 返回 Vault 主入口
      ],
      enemyTuning: {
        baseAlertRadius: 160,
        pathAlertLimit: 8,
        patrolSpeed: 0.65,
        chaseSpeed: 1.40,
        chaseDuration: 13000,
        maxChaseDistanceFromGuard: 1100
      },
      returnPressureDuration: 15000,
      pulseRequirement: 2,
      // v0.6：Stage02 出口刻意設計在地圖下方（跟 Stage01 相反），過關放大要往下飄離，不是往上
      exitDirection: 'down',
      briefing: {
        title: 'STAGE 02 | EMBER VAULT',
        subtitle: '第二關｜核心封鎖',
        shardRule: '收集 5 個，可形成 1 個 Core Pulse。',
        pulseRule: '出口需要 2 個；另一個菱形 Core Pulse 藏在 Vault 核心凹槽。',
        mission: '收集 5 個碎片形成一個 Core Pulse；引開 EMBER，潛入 Vault 取得另一個，再前往下方出口。',
        btnText: 'ENTER STAGE 02'
      }
    },
    3: {
      getMap: () => MazeLogic.getStage03Map(),
      enemyType: 'siphon',
      enemyAsset: 'assets/enemy_siphon.png',
      enemyName: 'SIPHON',
      // 巡邏座標必須落在格子中心；整數倍 CELL_SIZE 會落在格線交界並造成貼牆／抖動。
      // v0.10.9：SIPHON 明確留守 Core Pulse (7,19) 周圍，不為了放行玩家而離崗。
      // 守備廊上下接 y16/y22 兩條橫梁；玩家可繞另一縱幹引敵，再由相反端進出。
      enemyRoute: [
        { x: 7.5 * CELL_SIZE, y: 17.5 * CELL_SIZE },
        { x: 7.5 * CELL_SIZE, y: 18.5 * CELL_SIZE },
        { x: 7.5 * CELL_SIZE, y: 20.5 * CELL_SIZE },
        { x: 7.5 * CELL_SIZE, y: 21.5 * CELL_SIZE }
      ],
      enemyTuning: {
        baseAlertRadius: 165,
        pathAlertLimit: 12,
        pathSearchLimit: 64,
        patrolSpeed: 1.45,
        chaseSpeed: 3.15,
        chaseDuration: 14000,
        maxChaseDistanceFromGuard: 850,
        alertDelay: 260,
        chaseMemoryDuration: 8000,
        searchDuration: 6500,
        reactionInterval: 200
      },
      pulseRequirement: 2,
      exitDirection: 'down',
      cameraAnchorRatio: 0.44,
      briefing: {
        title: 'STAGE 03 | SIPHON CIRCUIT',
        subtitle: '第三關｜蝕核迴路',
        shardRule: '收集 5 個，可形成 1 個 Core Pulse。',
        pulseRule: '出口需要 2 個；另一個被 SIPHON 嚴密守護。',
        mission: '引開 SIPHON、取得核心並辨認真正出口。',
        btnText: 'ENTER STAGE 03'
      }
    }
  };

  function updateHudProgress() {
    const shardProgress = Math.min(shardCount, SHARDS_PER_PULSE);
    const pulseGoal = STAGE_CONFIG[currentStage]?.pulseRequirement || 0;
    if (hudShardVal) hudShardVal.textContent = `${shardProgress}/${SHARDS_PER_PULSE}`;
    if (hudPulseVal) hudPulseVal.textContent = `${Math.min(pulseCount, pulseGoal)}/${pulseGoal}`;
  }

  // 每次切關先回復共用 EnemyLogic 的正式預設值，再疊加該關 tuning，避免 S3 參數滲回 S1/S2。
  const DEFAULT_ENEMY_TUNING = Object.freeze({
    baseAlertRadius: 145,
    pathAlertLimit: 7,
    pathSearchLimit: 24,
    chaseDuration: 11000,
    alertDelay: 180,
    patrolSpeed: 0.62,
    chaseSpeed: 1.30,
    reactionInterval: 180,
    chaseMemoryDuration: 1300,
    searchDuration: 1800,
    maxChaseDistanceFromGuard: 950
  });

  function applyEnemyTuning(stageId) {
    const tuning = STAGE_CONFIG[stageId].enemyTuning || {};
    Object.assign(EnemyLogic, DEFAULT_ENEMY_TUNING, tuning);
  }

  function initEnemyForStage(stageId) {
    const cfg = STAGE_CONFIG[stageId];
    applyEnemyTuning(stageId);
    EnemyLogic.init(cfg.enemyRoute, cfg.enemyType || 'villainHunt');
    SiphonPressure.reset();
  }

  // v0.6：破關進度記憶，用 localStorage 永久保存，跟下面 sessionStorage 的「本局即時快照」
  // 是完全獨立的兩個系統，key 不同、生命週期不同，不能共用
  const ProgressManager = {
    key: 'coreo-dark-progress-v1',
    data: { highestUnlockedStage: 1, completedStages: [] },
    load() {
      try {
        const raw = localStorage.getItem(this.key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.highestUnlockedStage === 'number' && Array.isArray(parsed.completedStages)) {
            this.data = parsed;
          }
        }
      } catch (error) {
        // 讀取失敗視為全新玩家，不影響遊戲啟動
      }
    },
    save() {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.data));
      } catch (error) {
        // 儲存失敗不影響本局遊戲
      }
    },
    completeStage(stageId) {
      if (!this.data.completedStages.includes(stageId)) this.data.completedStages.push(stageId);
      if (stageId === this.data.highestUnlockedStage) this.data.highestUnlockedStage = stageId + 1;
      this.save();
    }
  };
  ProgressManager.load();

  function loadRunSnapshot() {
    try {
      const raw = sessionStorage.getItem(RUN_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.mazeData) || !parsed.playerPos) return null;
      if (parsed.stage03Memory) {
        stage03Memory = {
          visitedCells: new Set(parsed.stage03Memory.visitedCells || []),
          enteredBranches: new Set(parsed.stage03Memory.enteredBranches || []),
          resolvedBranches: new Set(parsed.stage03Memory.resolvedBranches || []),
          rejectedBranches: new Set(parsed.stage03Memory.rejectedBranches || []),
          lastDecisionJunction: parsed.stage03Memory.lastDecisionJunction || null
        };
      }
      return parsed;
    } catch (error) {
      sessionStorage.removeItem(RUN_STATE_KEY);
      return null;
    }
  }

  // JSON.stringify 會遺失掛在陣列上的 metadata；Stage 03 記憶與 SIPHON
  // 需要這些拓撲資料，因此複製地圖時必須明確保留。
  function cloneMazeData(source) {
    const clone = source.map((row) => [...row]);
    if (source.metadata) clone.metadata = JSON.parse(JSON.stringify(source.metadata));
    return clone;
  }

  const restoredRun = loadRunSnapshot();
  let currentStage = (restoredRun && STAGE_CONFIG[restoredRun.stage]) ? restoredRun.stage : 1;
  let pristineMazeData = cloneMazeData(STAGE_CONFIG[currentStage].getMap());
  let mazeData = restoredRun?.mazeData
    ? cloneMazeData(restoredRun.mazeData)
    : cloneMazeData(pristineMazeData);
  if (pristineMazeData.metadata) {
    mazeData.metadata = JSON.parse(JSON.stringify(pristineMazeData.metadata));
  }
  let playerPos = Render3D.buildWorld(mazeData, currentStage);
  let railDirection = null;
  let queuedTurn = null;
  let deferredControlCommand = null;
  let lastRailDirection = null;
  let lastControlCommandId = ControlLogic.commandId;
  CameraLogic.refreshMetrics();
  CameraLogic.setDirection(
    STAGE_CONFIG[currentStage].exitDirection,
    STAGE_CONFIG[currentStage].cameraAnchorRatio
  );
  if (restoredRun?.playerPos) playerPos = restoredRun.playerPos;

  const world = document.getElementById('world');
  world.className = `stage-0${currentStage}`;
  applyStageBodyClasses(currentStage);

  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';

  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite player-idle';
  playerDiv.appendChild(playerSprite);
  world.appendChild(playerDiv);

  initEnemyForStage(currentStage);
  if (restoredRun?.enemy) {
    Object.assign(EnemyLogic, {
      x: restoredRun.enemy.x ?? EnemyLogic.x,
      y: restoredRun.enemy.y ?? EnemyLogic.y,
      state: restoredRun.enemy.state || EnemyLogic.state,
      patrolIndex: restoredRun.enemy.patrolIndex ?? EnemyLogic.patrolIndex,
      chaseTimer: restoredRun.enemy.chaseTimer ?? EnemyLogic.chaseTimer,
      reactionTimer: restoredRun.enemy.reactionTimer ?? EnemyLogic.reactionTimer,
      chaseMemoryTimer: restoredRun.enemy.chaseMemoryTimer ?? EnemyLogic.chaseMemoryTimer,
      searchTimer: restoredRun.enemy.searchTimer ?? EnemyLogic.searchTimer,
      lastKnownCell: restoredRun.enemy.lastKnownCell || EnemyLogic.lastKnownCell
    });
    const route = STAGE_CONFIG[currentStage].enemyRoute;
    EnemyLogic.currentTarget = route[EnemyLogic.patrolIndex % route.length] || EnemyLogic.currentTarget;
    EnemyLogic.updateDOM();
  }
  if (currentStage === 3 && restoredRun?.siphonPressure) {
    SiphonPressure.restore(restoredRun.siphonPressure);
  }

  if (restoredRun) {
    shardCount = restoredRun.shardCount || 0;
    pulseCount = restoredRun.pulseCount || 0;
    updateHudProgress();
  }

  function saveRunSnapshot() {
    if (!hasGameStarted || isGameOver || isResetting) return;
    const snapshot = {
      stage: currentStage,
      playerPos,
      mazeData,
      shardCount,
      pulseCount,
      enemy: {
        x: EnemyLogic.x,
        y: EnemyLogic.y,
        state: EnemyLogic.state,
        patrolIndex: EnemyLogic.patrolIndex,
        chaseTimer: EnemyLogic.chaseTimer,
        reactionTimer: EnemyLogic.reactionTimer,
        chaseMemoryTimer: EnemyLogic.chaseMemoryTimer,
        searchTimer: EnemyLogic.searchTimer,
        lastKnownCell: EnemyLogic.lastKnownCell
      },
      siphonPressure: currentStage === 3 ? SiphonPressure.snapshot() : null,
      stage03Memory: {
        visitedCells: Array.from(stage03Memory.visitedCells),
        enteredBranches: Array.from(stage03Memory.enteredBranches),
        resolvedBranches: Array.from(stage03Memory.resolvedBranches),
        rejectedBranches: Array.from(stage03Memory.rejectedBranches),
        lastDecisionJunction: stage03Memory.lastDecisionJunction
      },
      savedAt: Date.now()
    };
    try {
      sessionStorage.setItem(RUN_STATE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      // 儲存失敗時不影響遊戲主流程；返回保護仍會生效。
    }
  }

  function clearRunSnapshot() {
    sessionStorage.removeItem(RUN_STATE_KEY);
  }

  function armBackGestureGuard() {
    if (backGuardArmed || !history.pushState) return;
    try {
      history.replaceState({ ...(history.state || {}), coreoGameEntry: true }, document.title, location.href);
      history.pushState({ coreoBackGuard: true }, document.title, location.href);
      backGuardArmed = true;
    } catch (error) {
      backGuardArmed = false;
    }
  }

  function holdGameAfterBackGesture() {
    ControlLogic.stop?.();
    saveRunSnapshot();
    try {
      history.pushState({ coreoBackGuard: true }, document.title, location.href);
    } catch (error) {
      // 某些 WebView 可能禁止 pushState；保留快照即可避免整場白打。
    }
  }

  window.addEventListener('popstate', () => {
    if (!hasGameStarted || isGameOver) return;
    holdGameAfterBackGesture();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ControlLogic.stop?.('visibilitychange');
      saveRunSnapshot();
    }
  });
  window.addEventListener('pagehide', () => {
    ControlLogic.stop?.('pagehide');
    saveRunSnapshot();
  });

  function isWall(cx, cy) {
    if (cy < 0 || cy >= mazeData.length || cx < 0 || cx >= mazeData[0].length) return true;
    // 代號 7（核心凹槽）對玩家而言是可通行路徑，只有代號 0 才是牆
    return mazeData[cy][cx] === 0;
  }

  function checkCollision(px, py) {
    const left = Math.floor((px - PLAYER_RADIUS) / CELL_SIZE);
    const right = Math.floor((px + PLAYER_RADIUS) / CELL_SIZE);
    const top = Math.floor((py - PLAYER_RADIUS) / CELL_SIZE);
    const bottom = Math.floor((py + PLAYER_RADIUS) / CELL_SIZE);
    return isWall(left, top) || isWall(right, top) || isWall(left, bottom) || isWall(right, bottom);
  }

  function updatePlayerDOM() {
    playerDiv.style.left = `${playerPos.x}px`;
    playerDiv.style.top = `${playerPos.y}px`;
  }

  // v0.9.7：正式版改採中心線軌道移動。輸入只決定方向，碰撞與轉角不再要求玩家
  // 在 4px 容錯內手動對準；提前轉向保留到第一個合法路口，同軸反向立即生效。
  function railCellOf(value) { return Math.floor(value / CELL_SIZE); }
  function railCenterOf(cell) { return cell * CELL_SIZE + CELL_SIZE / 2; }
  function currentRailCell() { return { x: railCellOf(playerPos.x), y: railCellOf(playerPos.y) }; }
  function isRailCentered(value) { return Math.abs(value - railCenterOf(railCellOf(value))) <= RAIL_NODE_EPSILON; }
  function isAtRailNode() { return isRailCentered(playerPos.x) && isRailCentered(playerPos.y); }
  function isSameDirection(a, b) { return !!(a && b && a.x === b.x && a.y === b.y); }
  function isOppositeDirection(a, b) { return !!(a && b && a.x === -b.x && a.y === -b.y); }
  function isPerpendicularDirection(a, b) { return !!(a && b && (a.x !== 0) !== (b.x !== 0)); }
  function isSameAxis(a, b) { return !!(a && b && (a.x !== 0) === (b.x !== 0)); }
  function isOpenFrom(cell, direction) {
    return !!(direction && !isWall(cell.x + direction.x, cell.y + direction.y));
  }

  function clearQueuedTurn() {
    queuedTurn = null;
  }

  function createTargetedTurn(direction, commandId, timestamp) {
    if (!railDirection || !isPerpendicularDirection(direction, railDirection)) return null;
    const target = RailAssist.findNearestLegalTurnAhead({
      maze: mazeData,
      position: playerPos,
      railDirection,
      desiredDirection: direction,
      cellSize: CELL_SIZE,
      maxDistance: currentStage === 3
        ? STAGE_03_TURN_TARGET_LOOKAHEAD_PX
        : RailAssist.TURN_TARGET_LOOKAHEAD_PX
    });
    if (!target) return null;
    return {
      commandId,
      direction: { ...direction },
      createdAt: timestamp,
      targetCell: { ...target.cell },
      targetCenter: { ...target.center },
      targetAxis: target.axis,
      targetGrace: currentStage === 3
        ? Math.max(target.grace, STAGE_03_TURN_TARGET_GRACE_PX)
        : target.grace,
      approachDirection: { ...railDirection },
      state: 'INTENT'
    };
  }

  function bindTurnIntent(direction, commandId, timestamp) {
    const targetedTurn = createTargetedTurn(direction, commandId, timestamp);
    if (targetedTurn) queuedTurn = targetedTurn;
  }

  function expireQueuedTurn(now) {
    if (!queuedTurn) return;
    const stage03Expired = currentStage === 3
      && (Math.max(0, now - queuedTurn.createdAt) > STAGE_03_TURN_TARGET_MAX_AGE_MS
        || RailAssist.hasPassedTargetBeyondGrace(playerPos, queuedTurn));
    const otherStageExpired = currentStage !== 3
      && RailAssist.queueExpired(queuedTurn, playerPos, now);
    if (!stage03Expired && !otherStageExpired) return;
    queuedTurn.state = 'EXPIRED';
    clearQueuedTurn();
    deferredControlCommand = null;
  }

  function executeQueuedTurn() {
    if (!queuedTurn || queuedTurn.state !== 'CONFIRMED') return false;
    if (!isOpenFrom(queuedTurn.targetCell, queuedTurn.direction)) {
      queuedTurn.state = 'CANCELLED';
      clearQueuedTurn();
      deferredControlCommand = null;
      return false;
    }
    const deferred = deferredControlCommand;
    deferredControlCommand = null;
    playerPos[queuedTurn.targetAxis] = queuedTurn.targetCenter[queuedTurn.targetAxis];
    railDirection = { ...queuedTurn.direction };
    lastRailDirection = { ...railDirection };
    queuedTurn.state = 'EXECUTED';
    clearQueuedTurn();
    if (deferred) {
      applyControlDirection(
        deferred.direction,
        deferred.commandId,
        deferred.intentCommandId,
        deferred.basisDirection,
        deferred.timestamp
      );
    }
    return true;
  }

  function confirmTargetedTurn(direction, commandId, intentCommandId, timestamp) {
    const matchesIntent = queuedTurn
      && isSameDirection(queuedTurn.direction, direction)
      && (!intentCommandId || queuedTurn.commandId === intentCommandId);
    if (!matchesIntent) queuedTurn = createTargetedTurn(direction, commandId, timestamp);
    if (!queuedTurn) return false;

    queuedTurn.commandId = commandId;
    queuedTurn.confirmedAt = timestamp;
    queuedTurn.state = 'CONFIRMED';
    if (RailAssist.hasPassedTargetBeyondGrace(playerPos, queuedTurn)) {
      queuedTurn.state = 'EXPIRED';
      clearQueuedTurn();
      return false;
    }
    if (RailAssist.isInsideTargetExecutionWindow(playerPos, queuedTurn)) return executeQueuedTurn();
    return true;
  }

  function resetRailControl() {
    railDirection = null;
    clearQueuedTurn();
    deferredControlCommand = null;
    lastRailDirection = null;
    lastControlCommandId = ControlLogic.commandId;
  }

  function applyControlDirection(
    direction,
    commandId,
    intentCommandId = null,
    basisDirection = null,
    timestamp = performance.now()
  ) {
    if (!direction) return;

    // A second confirmed gesture can arrive while the first target-bound turn is
    // still approaching its cell. Preserve it for immediately after that turn;
    // never reinterpret it as a reverse of the still-visible old rail direction.
    if (queuedTurn?.state === 'CONFIRMED'
      && basisDirection
      && isSameDirection(basisDirection, queuedTurn.direction)
      && !isSameDirection(basisDirection, railDirection)) {
      deferredControlCommand = {
        direction: { ...direction },
        commandId,
        intentCommandId,
        basisDirection: { ...basisDirection },
        timestamp
      };
      return;
    }

    if (!railDirection) {
      if (isAtRailNode()) {
        if (isOpenFrom(currentRailCell(), direction)) {
          railDirection = { ...direction };
          lastRailDirection = { ...direction };
          clearQueuedTurn();
        }
        return;
      }

      // 放開後可能停在兩個節點之間；只能沿原軌道軸重新起步，避免橫切牆體。
      if (lastRailDirection && isSameAxis(direction, lastRailDirection)) {
        railDirection = { ...direction };
        lastRailDirection = { ...direction };
        clearQueuedTurn();
      }
      return;
    }

    if (isSameDirection(direction, railDirection)) {
      return;
    }
    if (isOppositeDirection(direction, railDirection)) {
      railDirection = { ...direction };
      lastRailDirection = { ...direction };
      clearQueuedTurn();
      deferredControlCommand = null;
      return;
    }

    if (isPerpendicularDirection(direction, railDirection)) {
      confirmTargetedTurn(direction, commandId, intentCommandId, timestamp);
    }
  }

  function consumeControlCommands() {
    const commands = ControlLogic.getCommandsAfter(lastControlCommandId);
    for (const command of commands) {
      lastControlCommandId = command.id;
      if (command.type === 'stop') {
        railDirection = null;
        clearQueuedTurn();
        deferredControlCommand = null;
      } else if (command.type === 'turn-intent') {
        bindTurnIntent(command.direction, command.id, command.timestamp);
      } else if (command.type === 'direction') {
        applyControlDirection(
          command.direction,
          command.id,
          command.intentCommandId,
          command.basisDirection,
          command.timestamp
        );
      }
    }
  }

  function movePlayerAlongRails(distance, now = performance.now()) {
    expireQueuedTurn(now);
    let remaining = distance;
    let moved = false;
    let hitWall = false;
    let guard = 0;

    while (remaining > 0.01 && railDirection && guard++ < 8) {
      const axis = railDirection.x !== 0 ? 'x' : 'y';
      const sign = axis === 'x' ? railDirection.x : railDirection.y;
      const center = railCenterOf(railCellOf(playerPos[axis]));
      const delta = center - playerPos[axis];

      if (Math.abs(delta) <= RAIL_NODE_EPSILON) {
        playerPos[axis] = center;
        const cell = currentRailCell();
        if (queuedTurn
          && queuedTurn.state === 'CONFIRMED'
          && RailAssist.sameCell(cell, queuedTurn.targetCell)) {
          executeQueuedTurn();
          continue;
        }
        if (!isOpenFrom(cell, railDirection)) {
          railDirection = null;
          hitWall = true;
          break;
        }
        const step = Math.min(remaining, CELL_SIZE);
        playerPos[axis] += sign * step;
        remaining -= step;
        moved = moved || step > 0;
        continue;
      }

      if (delta * sign > 0) {
        const step = Math.min(remaining, Math.abs(delta));
        playerPos[axis] += sign * step;
        remaining -= step;
        moved = moved || step > 0;
        continue;
      }

      const nextCenter = center + sign * CELL_SIZE;
      const step = Math.min(remaining, Math.abs(nextCenter - playerPos[axis]));
      playerPos[axis] += sign * step;
      remaining -= step;
      moved = moved || step > 0;
    }
    return { moved, hitWall };
  }

  // v0.6：出口漸進視覺——0 個 Pulse 維持既有的白金光環基礎樣式，
  // 拿到部分但未達門檻時疊加 partial-charged 做出「還沒完全啟動」的視覺差異
  function updateExitVisual() {
    const exitDOM = document.querySelector('.cell.exit');
    if (!exitDOM) return;
    const req = STAGE_CONFIG[currentStage].pulseRequirement;

    if (currentStage === 3) {
      const fakes = document.querySelectorAll('.stage-03 .cell.pocket[data-grid-y="47"]');
      if (pulseCount >= req) {
        exitDOM.classList.remove('dormant');
        exitDOM.classList.add('active-exit');
        fakes.forEach((fake) => {
          fake.classList.remove('dormant');
          fake.classList.add('revealed-fake');
        });
      } else {
        exitDOM.classList.add('dormant');
        exitDOM.classList.remove('active-exit');
        fakes.forEach((fake) => {
          fake.classList.add('dormant');
          fake.classList.remove('revealed-fake');
        });
      }
    } else {
      exitDOM.classList.remove('partial-charged');
      if (pulseCount > 0 && pulseCount < req) {
        exitDOM.classList.add('partial-charged');
      }
    }
  }

  // v0.7.3-cx-pressure-test：Vault Pulse 被取走時才啟動回程追逐。
  // 不傳送 EMBER、不做全圖 GPS，只沿既有 BFS 追逐到守護錨點邊界，出口前仍保留短安全段。
  function armStage02ReturnPressure() {
    if (currentStage !== 2) return;
    EnemyLogic.state = 'chase';
    EnemyLogic.chaseTimer = STAGE_CONFIG[2].returnPressureDuration;
    EnemyLogic.reactionTimer = 0;
    EnemyLogic.lastKnownCell = EnemyLogic.toCell(playerPos, CELL_SIZE);
    EnemyLogic.chaseMemoryTimer = EnemyLogic.chaseMemoryDuration;
    FX.toggleGlobalAlert(true);
  }

  function armStage03SiphonHunt() {
    if (currentStage !== 3) return;
    SiphonPressure.armHunt({
      playerPos,
      cellSize: CELL_SIZE,
      direction: railDirection || lastRailDirection
    });
    FX.toggleGlobalAlert(true);
  }

  function checkPickups() {
    const cx = Math.floor(playerPos.x / CELL_SIZE);
    const cy = Math.floor(playerPos.y / CELL_SIZE);
    const type = mazeData[cy][cx];

    // type 4 = Core Shard｜核光碎片，type 5 = Core Pulse｜脈衝核心（直接拾取的高階資源點）
    if (type === 4 || type === 5) {
      mazeData[cy][cx] = 1;
      const coreDOM = document.getElementById(`core-${cx}-${cy}`);
      if (coreDOM) FX.collectCore(coreDOM, playerSprite, type);

      if (type === 4) {
        shardCount++;
        updateHudProgress();
        flashHud(hudShardVal);
        FX.spawnEdgeLight(playerPos.x, playerPos.y, 'basic');

        if (shardCount % SHARDS_PER_PULSE === 0) {
          pulseCount++;
          updateHudProgress();
          flashHud(hudPulseVal);
          FX.corePulseFeedback(playerSprite);
          energizeMatrix();
          updateExitVisual();
        }
      } else {
        pulseCount++;
        updateHudProgress();
        flashHud(hudPulseVal);
        FX.corePulseFeedback(playerSprite);
        energizeMatrix();
        updateExitVisual();
        armStage02ReturnPressure();
        armStage03SiphonHunt();
      }
      saveRunSnapshot();
    }

    if (type === 3) {
      // v0.6：通關條件改為依關卡讀取設定值（Stage01=1、Stage02=2），不再寫死
      const req = STAGE_CONFIG[currentStage].pulseRequirement;
      if (pulseCount >= req) {
        isGameOver = true;
        clearRunSnapshot();
        ProgressManager.completeStage(currentStage);
        FX.levelComplete(playerSprite, playerDiv, STAGE_CONFIG[currentStage].exitDirection);
      } else {
        FX.exitLocked(playerSprite, hudPulseVal);
      }
    }
  }

  function updateExplorationMemory() {
    if (currentStage !== 3 || !mazeData.metadata) return;
    const cx = Math.floor(playerPos.x / CELL_SIZE);
    const cy = Math.floor(playerPos.y / CELL_SIZE);
    stage03Memory.visitedCells.add(`${cx},${cy}`);

    const isJunction = mazeData.metadata.junctions.some((junction) => (
      junction.x === cx && junction.y === cy
    ));
    if (isJunction) {
      stage03Memory.lastDecisionJunction = { x: cx, y: cy };
      if (currentBranchId) {
        const branch = mazeData.metadata.branches.find((item) => item.id === currentBranchId);
        if (branch?.type === 'structural-dead') {
          stage03Memory.rejectedBranches.add(currentBranchId);
        } else if (branch?.type === 'conditional' && branch.reason === 'resource') {
          const hasResource = branch.cells.some(([x, y]) => {
            const value = mazeData[y]?.[x];
            return value === 4 || value === 5;
          });
          if (!hasResource) stage03Memory.resolvedBranches.add(currentBranchId);
        }
        currentBranchId = null;
      }
    } else {
      const branch = mazeData.metadata.branches.find((item) => (
        item.cells.some(([x, y]) => x === cx && y === cy)
      ));
      if (branch) {
        currentBranchId = branch.id;
        stage03Memory.enteredBranches.add(branch.id);
      }
    }

    stage03Memory.rejectedBranches.forEach((branchId) => {
      const branch = mazeData.metadata.branches.find((item) => item.id === branchId);
      const [x, y] = branch?.cells?.[0] || [];
      const cell = document.querySelector(
        `.cell.path[data-grid-x="${x}"][data-grid-y="${y}"]`
      );
      if (cell) cell.classList.add('rejected-path');
    });

    stage03Memory.resolvedBranches.forEach((branchId) => {
      const branch = mazeData.metadata.branches.find((item) => item.id === branchId);
      const [x, y] = branch?.cells?.[0] || [];
      const cell = document.querySelector(
        `.cell.path[data-grid-x="${x}"][data-grid-y="${y}"]`
      );
      if (cell) cell.classList.add('resolved-path');
    });
  }

  function triggerSignalLost() {
    if (isResetting || isGameOver) return;
    isResetting = true;

    const globalAlert = document.getElementById('global-alert-overlay');
    if (globalAlert) globalAlert.classList.add('flash');

    playerSprite.classList.add('player-signal-lost');

    const cameraRig = document.getElementById('camera-rig');
    if (cameraRig) cameraRig.classList.add('world-shake-blur');

    const signalLostUI = document.getElementById('signal-lost-overlay');
    if (signalLostUI) signalLostUI.classList.add('show');

    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200]);

    setTimeout(resetLevel, 900);
  }

  function resetLevel() {
    clearRunSnapshot();
    mazeData = cloneMazeData(pristineMazeData);
    playerPos = Render3D.buildWorld(mazeData, currentStage);
    ControlLogic.stop('level-reset');
    resetRailControl();
    CameraLogic.refreshMetrics();

    world.appendChild(playerDiv);
    updatePlayerDOM();
    initEnemyForStage(currentStage);

    currentSpeed = baseSpeed;
    isGameOver = false;
    shardCount = 0;
    pulseCount = 0;
    stage03Memory = {
      visitedCells: new Set(),
      enteredBranches: new Set(),
      resolvedBranches: new Set(),
      rejectedBranches: new Set(),
      lastDecisionJunction: null
    };
    currentBranchId = null;
    updateHudProgress();
    updateExitVisual();

    const globalAlert = document.getElementById('global-alert-overlay');
    if (globalAlert) globalAlert.classList.remove('flash', 'active');

    playerSprite.className = 'actor-sprite player-idle';

    const cameraRig = document.getElementById('camera-rig');
    if (cameraRig) cameraRig.classList.remove('world-shake-blur');

    const signalLostUI = document.getElementById('signal-lost-overlay');
    if (signalLostUI) signalLostUI.classList.remove('show');

    isResetting = false;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function gameLoop(time) {
    if (isGameOver || isResetting) return;
    const dt = Math.min(time - lastTime, MAX_FRAME_DT);
    lastTime = time;
    const timeScale = dt / 16.66;

    consumeControlCommands();
    if (railDirection) {
      const entrySpeedScale = RailAssist.entrySpeedScale(mazeData, currentRailCell(), railDirection);
      const movement = movePlayerAlongRails(currentSpeed * entrySpeedScale * timeScale, time);
      if (movement.hitWall) FX.wallBump(playerSprite);
      if (movement.moved) {
        updatePlayerDOM();
        checkPickups();
        updateExplorationMemory();

        if (!isPulseEffectActive(time) && time - lastTrailTime >= TRAIL_INTERVAL) {
          lastTrailTime = time;
          FX.spawnTrail(world, playerPos.x, playerPos.y);
        }
      }
    }

    const cx = Math.floor(playerPos.x / CELL_SIZE);
    const cy = Math.floor(playerPos.y / CELL_SIZE);
    const isPlayerHidden = Boolean(mazeData[cy] && mazeData[cy][cx] === 6);

    if (currentStage === 3) {
      SiphonPressure.setPlayerContext({
        playerPos,
        cellSize: CELL_SIZE,
        direction: railDirection || lastRailDirection
      });
    }
    EnemyLogic.update(playerPos, isPlayerHidden, dt, mazeData, CELL_SIZE);

    const distToEnemy = Math.hypot(playerPos.x - EnemyLogic.x, playerPos.y - EnemyLogic.y);
    if (distToEnemy < PLAYER_RADIUS + EnemyLogic.radius) {
      triggerSignalLost();
      return;
    }

    CameraLogic.update(playerPos.y, dt);
    requestAnimationFrame(gameLoop);
  }

  updatePlayerDOM();
  updateExitVisual();

  // v0.6：Stage Select（只在沒有救回快照、且已解鎖 Stage 02 時顯示）＋ Stage Briefing 文字改動態注入
  const stageSelectUI = document.getElementById('stage-select-overlay');
  const briefingOverlay = document.getElementById('stage-briefing');
  const briefingTitleEl = document.getElementById('briefing-title');
  const briefingSubtitleEl = document.getElementById('briefing-subtitle');
  const briefingShardRuleEl = document.getElementById('briefing-shard-rule');
  const briefingPulseRuleEl = document.getElementById('briefing-pulse-rule');
  const briefingMissionEl = document.getElementById('briefing-mission');
  const briefingEnterBtn = document.getElementById('briefing-enter-btn');
  const briefingEnemyImgEl = document.getElementById('briefing-enemy-img');
  const briefingEnemyNameEl = document.getElementById('briefing-enemy-name');

  function applyBriefingText(stageId) {
    const cfg = STAGE_CONFIG[stageId];
    if (briefingTitleEl) briefingTitleEl.textContent = cfg.briefing.title;
    if (briefingSubtitleEl) briefingSubtitleEl.textContent = cfg.briefing.subtitle;
    if (briefingShardRuleEl) briefingShardRuleEl.textContent = cfg.briefing.shardRule;
    if (briefingPulseRuleEl) briefingPulseRuleEl.textContent = cfg.briefing.pulseRule;
    if (briefingMissionEl) briefingMissionEl.textContent = cfg.briefing.mission;
    if (briefingEnterBtn) briefingEnterBtn.textContent = cfg.briefing.btnText;
    const enemyType = cfg.enemyType || 'villainHunt';
    if (briefingEnemyImgEl) {
      briefingEnemyImgEl.src = cfg.enemyAsset || 'assets/enemy_ember.png';
      briefingEnemyImgEl.alt = cfg.enemyName || 'EMBER';
    }
    if (briefingEnemyNameEl) {
      briefingEnemyNameEl.textContent = cfg.enemyName || 'EMBER';
      briefingEnemyNameEl.className = `cinematic-name ${enemyType === 'siphon' ? 'siphon-name' : 'ember-name'}`;
    }

    // v0.7.1：依關卡套用專屬 CSS class，供 Stage 02 白金儀表板與光效使用
    if (briefingOverlay) {
      briefingOverlay.classList.toggle('stage-02', stageId === 2);
      briefingOverlay.classList.toggle('stage-03', stageId === 3);
    }
  }

  // 只有從 Stage Select 主動選關時才會呼叫，救回狀態不會走這條路徑，
  // 所以這裡永遠是「乾淨開始新的一關」，不需要處理救回快照
  function enterStage(stageId) {
    currentStage = stageId;
    pristineMazeData = cloneMazeData(STAGE_CONFIG[stageId].getMap());
    mazeData = cloneMazeData(pristineMazeData);
    playerPos = Render3D.buildWorld(mazeData, stageId);
    ControlLogic.stop('stage-change');
    resetRailControl();
    CameraLogic.refreshMetrics();
    CameraLogic.setDirection(
      STAGE_CONFIG[stageId].exitDirection,
      STAGE_CONFIG[stageId].cameraAnchorRatio
    );
    world.className = `stage-0${stageId}`;
    applyStageBodyClasses(stageId);
    world.appendChild(playerDiv);
    updatePlayerDOM();

    shardCount = 0;
    pulseCount = 0;
    stage03Memory = {
      visitedCells: new Set(),
      enteredBranches: new Set(),
      resolvedBranches: new Set(),
      rejectedBranches: new Set(),
      lastDecisionJunction: null
    };
    currentBranchId = null;
    updateHudProgress();

    initEnemyForStage(stageId);
    updateExitVisual();

    if (stageSelectUI) stageSelectUI.classList.remove('show');
    applyBriefingText(stageId);
    if (briefingOverlay) {
      briefingOverlay.style.display = 'flex';
      briefingOverlay.classList.add('show');
    }
  }

  if (!restoredRun && stageSelectUI && ProgressManager.data.highestUnlockedStage > 1) {
    const btnS1 = document.getElementById('btn-stage-1');
    const btnS2 = document.getElementById('btn-stage-2');
    const btnS3 = document.getElementById('btn-stage-3');
    if (btnS2) btnS2.classList.remove('locked');
    if (btnS3 && ProgressManager.data.highestUnlockedStage >= 3) btnS3.classList.remove('locked');
    if (briefingOverlay) briefingOverlay.classList.remove('show');
    stageSelectUI.classList.add('show');
    if (btnS1) btnS1.addEventListener('click', () => enterStage(1));
    if (btnS2) btnS2.addEventListener('click', () => enterStage(2));
    if (btnS3 && ProgressManager.data.highestUnlockedStage >= 3) {
      btnS3.addEventListener('click', () => enterStage(3));
    }
  } else {
    // 全新玩家直接進 Stage 01，或救回狀態直接顯示救回時所在關卡的 Briefing 文字
    applyBriefingText(currentStage);
  }

  function startGame() {
    hasGameStarted = true;
    document.body.classList.add('game-started');
    armBackGestureGuard();

    if (briefingOverlay) {
      briefingOverlay.classList.remove('show');
      // 關掉後直接脫離渲染樹，不能只靠 opacity:0，
      // 不然裡面的漂浮動畫、漸層背景會在背景持續運算，拖垮 Android 幀率、
      // 造成 dt 忽大忽小，主角跟反派移動就會看起來像卡頓後爆衝
      briefingOverlay.style.display = 'none';
    }
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  if (briefingEnterBtn) {
    briefingEnterBtn.addEventListener('click', startGame, { once: true });
  } else {
    startGame();
  }
});
