// js/main.js
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  ControlLogic.init();
  CameraLogic.init();

  const CELL_SIZE = Render3D.CELL_SIZE;
  const PLAYER_RADIUS = 21;
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
  const RUN_STATE_KEY = 'coreo-dark-run-state-v2'; // v0.9.0 地圖尺寸改變，舊快照不可沿用
  const LAB_DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const LAB_TURN_WINDOW = 14;
  const LAB_ALIGNMENT_TOLERANCE = 10;
  const LAB_RECOVERY_WINDOW = 20;
  const LAB_CENTERING_SPEED = 1.55;
  let labMoveDirection = null;
  let labQueuedDirection = null;
  let labLastCommandId = 0;
  let labBlockedDirection = null;
  let pulseEffectUntil = 0;
  let pulseEffectTimer = null;

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
    const glowClass = currentStage === 2 ? 'glow-s2' : 'glow';
    el.classList.add(glowClass);
    setTimeout(() => el.classList.remove(glowClass), 200);
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
      exitDirection: 'up',
      briefing: {
        title: 'STAGE 01 | CORE AWAKENING',
        subtitle: '第一關｜核心甦醒',
        shardRule: '收集 5 個，可形成 1 個 Core Pulse。',
        pulseRule: '出口需要 1 個；可由碎片形成，或直接取得。',
        mission: '收集 5 個碎片，或取得菱形 Core Pulse；避開 EMBER，啟動上方出口。',
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
    }
  };

  // Stage01 保留原參數；只有進入 Stage02 時才套用小幅壓力補強，避免改壞共用 EnemyLogic。
  function applyEnemyTuning(stageId) {
    const tuning = STAGE_CONFIG[stageId].enemyTuning;
    if (!tuning) return;
    Object.assign(EnemyLogic, tuning);
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
      return parsed;
    } catch (error) {
      sessionStorage.removeItem(RUN_STATE_KEY);
      return null;
    }
  }

  const restoredRun = loadRunSnapshot();
  let currentStage = (restoredRun && STAGE_CONFIG[restoredRun.stage]) ? restoredRun.stage : 1;
  let pristineMazeData = JSON.parse(JSON.stringify(STAGE_CONFIG[currentStage].getMap()));
  let mazeData = restoredRun?.mazeData || JSON.parse(JSON.stringify(pristineMazeData));
  let playerPos = Render3D.buildWorld(mazeData, currentStage);
  CameraLogic.refreshMetrics();
  CameraLogic.setDirection(STAGE_CONFIG[currentStage].exitDirection);
  if (restoredRun?.playerPos) playerPos = restoredRun.playerPos;

  const world = document.getElementById('world');
  world.className = `stage-0${currentStage}`;
  document.body.classList.toggle('stage-02-active', currentStage === 2);

  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';

  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite player-idle';
  playerDiv.appendChild(playerSprite);
  world.appendChild(playerDiv);

  applyEnemyTuning(currentStage);
  EnemyLogic.init(STAGE_CONFIG[currentStage].enemyRoute, 'villainHunt');
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

  if (restoredRun) {
    shardCount = restoredRun.shardCount || 0;
    pulseCount = restoredRun.pulseCount || 0;
    if (hudShardVal) hudShardVal.textContent = shardCount.toString().padStart(2, '0');
    if (hudPulseVal) hudPulseVal.textContent = pulseCount.toString();
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
    if (document.visibilityState === 'hidden') saveRunSnapshot();
  });
  window.addEventListener('pagehide', saveRunSnapshot);

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

  function resetLabMovement() {
    labMoveDirection = null;
    labQueuedDirection = null;
    labBlockedDirection = null;
    ControlLogic.stop?.();
    labLastCommandId = ControlLogic.getCommandId?.() || 0;
  }

  function labIsHorizontal(direction) {
    return direction === 'left' || direction === 'right';
  }

  function labIsOpposite(a, b) {
    return (a === 'left' && b === 'right') || (a === 'right' && b === 'left') ||
      (a === 'up' && b === 'down') || (a === 'down' && b === 'up');
  }

  function labCanMove(direction, distance = 1) {
    const vector = LAB_DIRECTIONS[direction];
    if (!vector) return false;
    return !checkCollision(playerPos.x + vector.x * distance, playerPos.y + vector.y * distance);
  }

  function labNeighborOpen(direction) {
    const vector = LAB_DIRECTIONS[direction];
    if (!vector) return false;
    const cellX = Math.floor(playerPos.x / CELL_SIZE);
    const cellY = Math.floor(playerPos.y / CELL_SIZE);
    return !isWall(cellX + vector.x, cellY + vector.y);
  }

  // 新方向若尚未開放就留在 queue；目前方向繼續走，到第一個合法路口才轉。
  function applyLabQueuedTurn() {
    if (!labQueuedDirection) return false;

    if (!labMoveDirection) {
      if (!labCanMove(labQueuedDirection)) {
        const cellX = Math.floor(playerPos.x / CELL_SIZE);
        const cellY = Math.floor(playerPos.y / CELL_SIZE);
        const centerX = cellX * CELL_SIZE + CELL_SIZE / 2;
        const centerY = cellY * CELL_SIZE + CELL_SIZE / 2;
        const crossOffset = labIsHorizontal(labQueuedDirection) ? playerPos.y - centerY : playerPos.x - centerX;
        if (
          Math.abs(crossOffset) > LAB_RECOVERY_WINDOW ||
          !labNeighborOpen(labQueuedDirection) ||
          checkCollision(centerX, centerY)
        ) return false;
        playerPos.x = centerX;
        playerPos.y = centerY;
      }
      labMoveDirection = labQueuedDirection;
      labQueuedDirection = null;
      labBlockedDirection = null;
      return true;
    }

    if (labQueuedDirection === labMoveDirection) {
      labQueuedDirection = null;
      return false;
    }

    if (labIsOpposite(labMoveDirection, labQueuedDirection)) {
      if (!labCanMove(labQueuedDirection)) return false;
      labMoveDirection = labQueuedDirection;
      labQueuedDirection = null;
      labBlockedDirection = null;
      return true;
    }

    const cellX = Math.floor(playerPos.x / CELL_SIZE);
    const cellY = Math.floor(playerPos.y / CELL_SIZE);
    const centerX = cellX * CELL_SIZE + CELL_SIZE / 2;
    const centerY = cellY * CELL_SIZE + CELL_SIZE / 2;
    const alongOffset = labIsHorizontal(labMoveDirection) ? playerPos.x - centerX : playerPos.y - centerY;
    const crossOffset = labIsHorizontal(labMoveDirection) ? playerPos.y - centerY : playerPos.x - centerX;

    if (
      Math.abs(alongOffset) > LAB_TURN_WINDOW ||
      Math.abs(crossOffset) > LAB_ALIGNMENT_TOLERANCE ||
      !labNeighborOpen(labQueuedDirection) ||
      checkCollision(centerX, centerY)
    ) return false;

    playerPos.x = centerX;
    playerPos.y = centerY;
    labMoveDirection = labQueuedDirection;
    labQueuedDirection = null;
    labBlockedDirection = null;
    return true;
  }

  function centerLabPlayer(direction, timeScale) {
    if (!direction) return false;
    const cellX = Math.floor(playerPos.x / CELL_SIZE);
    const cellY = Math.floor(playerPos.y / CELL_SIZE);
    const centerX = cellX * CELL_SIZE + CELL_SIZE / 2;
    const centerY = cellY * CELL_SIZE + CELL_SIZE / 2;
    const maxCorrection = LAB_CENTERING_SPEED * timeScale;

    if (labIsHorizontal(direction)) {
      const correction = Math.sign(centerY - playerPos.y) * Math.min(Math.abs(centerY - playerPos.y), maxCorrection);
      if (!correction || checkCollision(playerPos.x, playerPos.y + correction)) return false;
      playerPos.y += correction;
      return true;
    }

    const correction = Math.sign(centerX - playerPos.x) * Math.min(Math.abs(centerX - playerPos.x), maxCorrection);
    if (!correction || checkCollision(playerPos.x + correction, playerPos.y)) return false;
    playerPos.x += correction;
    return true;
  }

  function updateLabPlayerMovement(time, timeScale) {
    if (!ControlLogic.isPressed?.()) {
      labMoveDirection = null;
      labQueuedDirection = null;
      labBlockedDirection = null;
      labLastCommandId = ControlLogic.getCommandId?.() || labLastCommandId;
      return false;
    }

    const commandId = ControlLogic.getCommandId?.() || 0;
    if (commandId !== labLastCommandId) {
      labLastCommandId = commandId;
      const requestedDirection = ControlLogic.getDirection?.();
      if (requestedDirection) labQueuedDirection = requestedDirection;
    }

    let moved = applyLabQueuedTurn();
    if (!labMoveDirection) return moved;

    if (centerLabPlayer(labMoveDirection, timeScale)) moved = true;
    const vector = LAB_DIRECTIONS[labMoveDirection];
    const distance = currentSpeed * timeScale;
    const nextX = playerPos.x + vector.x * distance;
    const nextY = playerPos.y + vector.y * distance;

    if (!checkCollision(nextX, nextY)) {
      playerPos.x = nextX;
      playerPos.y = nextY;
      moved = true;
      labBlockedDirection = null;
    } else {
      if (!labQueuedDirection && labBlockedDirection !== labMoveDirection) {
        labBlockedDirection = labMoveDirection;
        FX.wallBump(playerSprite);
      }
      if (applyLabQueuedTurn()) moved = true;
    }

    if (moved) {
      updatePlayerDOM();
      checkPickups();
      if (!isPulseEffectActive(time) && time - lastTrailTime >= TRAIL_INTERVAL) {
        lastTrailTime = time;
        FX.spawnTrail(world, playerPos.x, playerPos.y);
      }
    }
    return moved;
  }

  function updatePlayerDOM() {
    playerDiv.style.left = `${playerPos.x}px`;
    playerDiv.style.top = `${playerPos.y}px`;
  }

  // v0.6：出口漸進視覺——0 個 Pulse 維持既有的白金光環基礎樣式，
  // 拿到部分但未達門檻時疊加 partial-charged 做出「還沒完全啟動」的視覺差異
  function updateExitVisual() {
    const exitDOM = document.querySelector('.cell.exit');
    if (!exitDOM) return;
    const req = STAGE_CONFIG[currentStage].pulseRequirement;
    exitDOM.classList.remove('partial-charged');
    if (pulseCount > 0 && pulseCount < req) {
      exitDOM.classList.add('partial-charged');
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
        if (hudShardVal) hudShardVal.textContent = shardCount.toString().padStart(2, '0');
        flashHud(hudShardVal);
        FX.spawnEdgeLight(playerPos.x, playerPos.y, 'basic');

        if (shardCount % SHARDS_PER_PULSE === 0) {
          pulseCount++;
          if (hudPulseVal) hudPulseVal.textContent = pulseCount.toString();
          flashHud(hudPulseVal);
          FX.corePulseFeedback(playerSprite);
          energizeMatrix();
          updateExitVisual();
        }
      } else {
        pulseCount++;
        if (hudPulseVal) hudPulseVal.textContent = pulseCount.toString();
        flashHud(hudPulseVal);
        FX.corePulseFeedback(playerSprite);
        energizeMatrix();
        updateExitVisual();
        armStage02ReturnPressure();
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

  function triggerSignalLost() {
    if (isResetting || isGameOver) return;
    isResetting = true;
    resetLabMovement();

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
    resetLabMovement();
    mazeData = JSON.parse(JSON.stringify(pristineMazeData));
    playerPos = Render3D.buildWorld(mazeData, currentStage);
    CameraLogic.refreshMetrics();

    world.appendChild(playerDiv);
    updatePlayerDOM();
    applyEnemyTuning(currentStage);
    EnemyLogic.init(STAGE_CONFIG[currentStage].enemyRoute, 'villainHunt');

    currentSpeed = baseSpeed;
    isGameOver = false;
    shardCount = 0;
    pulseCount = 0;
    if (hudShardVal) hudShardVal.textContent = '00';
    if (hudPulseVal) hudPulseVal.textContent = '0';
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

    updateLabPlayerMovement(time, timeScale);

    const cx = Math.floor(playerPos.x / CELL_SIZE);
    const cy = Math.floor(playerPos.y / CELL_SIZE);
    const isPlayerHidden = Boolean(mazeData[cy] && mazeData[cy][cx] === 6);

    EnemyLogic.update(playerPos, isPlayerHidden, dt, mazeData, CELL_SIZE);

    const distToEnemy = Math.hypot(playerPos.x - EnemyLogic.x, playerPos.y - EnemyLogic.y);
    if (distToEnemy < PLAYER_RADIUS + EnemyLogic.radius) {
      triggerSignalLost();
      return;
    }

    CameraLogic.update(playerPos.y);
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

  function applyBriefingText(stageId) {
    const cfg = STAGE_CONFIG[stageId];
    if (briefingTitleEl) briefingTitleEl.textContent = cfg.briefing.title;
    if (briefingSubtitleEl) briefingSubtitleEl.textContent = cfg.briefing.subtitle;
    if (briefingShardRuleEl) briefingShardRuleEl.textContent = cfg.briefing.shardRule;
    if (briefingPulseRuleEl) briefingPulseRuleEl.textContent = cfg.briefing.pulseRule;
    if (briefingMissionEl) briefingMissionEl.textContent = cfg.briefing.mission;
    if (briefingEnterBtn) briefingEnterBtn.textContent = cfg.briefing.btnText;

    // v0.7.1：依關卡套用專屬 CSS class，供 Stage 02 白金儀表板與光效使用
    if (briefingOverlay) briefingOverlay.classList.toggle('stage-02', stageId === 2);
  }

  // 只有從 Stage Select 主動選關時才會呼叫，救回狀態不會走這條路徑，
  // 所以這裡永遠是「乾淨開始新的一關」，不需要處理救回快照
  function enterStage(stageId) {
    currentStage = stageId;
    pristineMazeData = JSON.parse(JSON.stringify(STAGE_CONFIG[stageId].getMap()));
    mazeData = JSON.parse(JSON.stringify(pristineMazeData));
    playerPos = Render3D.buildWorld(mazeData, stageId);
    CameraLogic.refreshMetrics();
    CameraLogic.setDirection(STAGE_CONFIG[stageId].exitDirection);
    world.className = `stage-0${stageId}`;
    document.body.classList.toggle('stage-02-active', stageId === 2);
    world.appendChild(playerDiv);
    updatePlayerDOM();

    shardCount = 0;
    pulseCount = 0;
    if (hudShardVal) hudShardVal.textContent = '00';
    if (hudPulseVal) hudPulseVal.textContent = '0';

    applyEnemyTuning(stageId);
    EnemyLogic.init(STAGE_CONFIG[stageId].enemyRoute, 'villainHunt');
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
    if (btnS2) btnS2.classList.remove('locked');
    if (briefingOverlay) briefingOverlay.classList.remove('show');
    stageSelectUI.classList.add('show');
    if (btnS1) btnS1.addEventListener('click', () => enterStage(1));
    if (btnS2) btnS2.addEventListener('click', () => enterStage(2));
  } else {
    // 全新玩家直接進 Stage 01，或救回狀態直接顯示救回時所在關卡的 Briefing 文字
    applyBriefingText(currentStage);
  }

  function startGame() {
    hasGameStarted = true;
    resetLabMovement();
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
