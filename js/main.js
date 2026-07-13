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
  const PULSE_EFFECT_DURATION = 950;
  const RUN_STATE_KEY = 'coreo-dark-run-state-v1';
  let pulseEffectUntil = 0;

  // v0.5.14: Core Shard / Core Pulse 資源規則（GPT 裁決）
  const SHARDS_PER_PULSE = 5;
  let shardCount = 0;
  let pulseCount = 0;
  const hudShardVal = document.getElementById('ui-shard-val');
  const hudPulseVal = document.getElementById('ui-pulse-val');

  function flashHud(el) {
    if (!el) return;
    el.classList.add('glow');
    setTimeout(() => el.classList.remove('glow'), 200);
  }

  // v0.5.27: Core Pulse 只保留短暫矩陣回饋。iPhone/Android 在 Pulse 後會同時承受追逐與特效，
  // 因此避免長時間全迷宮陰影動畫拖慢主迴圈。
  function energizeMatrix() {
    if (!world) return;
    pulseEffectUntil = performance.now() + PULSE_EFFECT_DURATION;
    world.classList.add('energized');
    setTimeout(() => world.classList.remove('energized'), PULSE_EFFECT_DURATION);
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
      pulseRequirement: 1,
      briefing: {
        title: 'STAGE 01 | CORE AWAKENING',
        subtitle: '第一關｜核心甦醒',
        mission: '收集核光碎片，形成 Core Pulse，避開 EMBER，抵達出口。',
        btnText: 'ENTER STAGE 01'
      }
    },
    2: {
      getMap: () => MazeLogic.getStage02Map(),
      enemyRoute: [
        { x: 3.5 * CELL_SIZE, y: 24.5 * CELL_SIZE },
        { x: 1.5 * CELL_SIZE, y: 26.5 * CELL_SIZE },
        { x: 5.5 * CELL_SIZE, y: 26.5 * CELL_SIZE },
        { x: 3.5 * CELL_SIZE, y: 28.5 * CELL_SIZE }
      ],
      pulseRequirement: 2,
      briefing: {
        title: 'STAGE 02 | EMBER VAULT',
        subtitle: '第二關｜核心封鎖',
        mission: '引開 EMBER 進入核心凹槽，形成 2 個 Core Pulse 以啟動出口。',
        btnText: 'ENTER STAGE 02'
      }
    }
  };

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
  if (restoredRun?.playerPos) playerPos = restoredRun.playerPos;

  const world = document.getElementById('world');
  world.className = `stage-0${currentStage}`;

  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';

  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite player-idle';
  playerDiv.appendChild(playerSprite);
  world.appendChild(playerDiv);

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
          FX.spawnEdgeLight(playerPos.x, playerPos.y, 'pulse');
          energizeMatrix();
          updateExitVisual();
        }
      } else {
        pulseCount++;
        if (hudPulseVal) hudPulseVal.textContent = pulseCount.toString();
        flashHud(hudPulseVal);
        FX.corePulseFeedback(playerSprite);
        FX.spawnEdgeLight(playerPos.x, playerPos.y, 'pulse');
        energizeMatrix();
        updateExitVisual();
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
        FX.levelComplete(playerSprite, playerDiv);
      } else {
        FX.exitLocked(playerSprite, hudPulseVal);
      }
    }
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
    mazeData = JSON.parse(JSON.stringify(pristineMazeData));
    playerPos = Render3D.buildWorld(mazeData, currentStage);

    world.appendChild(playerDiv);
    updatePlayerDOM();
    EnemyLogic.init(STAGE_CONFIG[currentStage].enemyRoute, 'villainHunt');

    currentSpeed = baseSpeed;
    isGameOver = false;
    EnemyLogic.alertRadius = EnemyLogic.baseAlertRadius;

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

    const vec = ControlLogic.getVector();
    if (vec.x !== 0 || vec.y !== 0) {
      const nextX = playerPos.x + vec.x * currentSpeed * timeScale;
      const nextY = playerPos.y + vec.y * currentSpeed * timeScale;
      let movedX = false;
      let movedY = false;
      let hitWall = false;

      if (!checkCollision(nextX, playerPos.y)) { playerPos.x = nextX; movedX = true; }
      else { hitWall = true; }

      if (!checkCollision(playerPos.x, nextY)) { playerPos.y = nextY; movedY = true; }
      else { hitWall = true; }

      if (hitWall) FX.wallBump(playerSprite);
      if (movedX || movedY) {
        updatePlayerDOM();
        checkPickups();

        if (!isPulseEffectActive(time) && time - lastTrailTime >= TRAIL_INTERVAL) {
          lastTrailTime = time;
          FX.spawnTrail(world, playerPos.x, playerPos.y);
        }
      }
    }

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
  const briefingMissionEl = document.getElementById('briefing-mission');
  const briefingEnterBtn = document.getElementById('briefing-enter-btn');

  function applyBriefingText(stageId) {
    const cfg = STAGE_CONFIG[stageId];
    if (briefingTitleEl) briefingTitleEl.textContent = cfg.briefing.title;
    if (briefingSubtitleEl) briefingSubtitleEl.textContent = cfg.briefing.subtitle;
    if (briefingMissionEl) briefingMissionEl.textContent = cfg.briefing.mission;
    if (briefingEnterBtn) briefingEnterBtn.textContent = cfg.briefing.btnText;
  }

  // 只有從 Stage Select 主動選關時才會呼叫，救回狀態不會走這條路徑，
  // 所以這裡永遠是「乾淨開始新的一關」，不需要處理救回快照
  function enterStage(stageId) {
    currentStage = stageId;
    pristineMazeData = JSON.parse(JSON.stringify(STAGE_CONFIG[stageId].getMap()));
    mazeData = JSON.parse(JSON.stringify(pristineMazeData));
    playerPos = Render3D.buildWorld(mazeData, stageId);
    world.className = `stage-0${stageId}`;
    world.appendChild(playerDiv);
    updatePlayerDOM();

    shardCount = 0;
    pulseCount = 0;
    if (hudShardVal) hudShardVal.textContent = '00';
    if (hudPulseVal) hudPulseVal.textContent = '0';

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
