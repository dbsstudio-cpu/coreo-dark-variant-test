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

  const pristineMazeData = JSON.parse(JSON.stringify(MazeLogic.getTestCorridor()));
  const restoredRun = loadRunSnapshot();
  let mazeData = restoredRun?.mazeData || JSON.parse(JSON.stringify(pristineMazeData));
  let playerPos = Render3D.buildWorld(mazeData);
  if (restoredRun?.playerPos) playerPos = restoredRun.playerPos;

  const world = document.getElementById('world');
  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';

  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite player-idle';
  playerDiv.appendChild(playerSprite);
  world.appendChild(playerDiv);

  // v0.5.7: mid-left patrol with a right-side bypass. Keep the start lane safe.
  const enemyRoute = [
    { x: 1.5 * CELL_SIZE, y: 21.5 * CELL_SIZE },
    { x: 1.5 * CELL_SIZE, y: 20.5 * CELL_SIZE },
    { x: 1.5 * CELL_SIZE, y: 19.5 * CELL_SIZE },
    { x: 1.5 * CELL_SIZE, y: 18.5 * CELL_SIZE },
    { x: 1.5 * CELL_SIZE, y: 17.5 * CELL_SIZE },
    { x: 2.5 * CELL_SIZE, y: 17.5 * CELL_SIZE },
    { x: 1.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }
  ];

  EnemyLogic.init(enemyRoute, 'villainHunt');
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
    EnemyLogic.currentTarget = enemyRoute[EnemyLogic.patrolIndex % enemyRoute.length] || EnemyLogic.currentTarget;
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

        if (shardCount % SHARDS_PER_PULSE === 0) {
          pulseCount++;
          if (hudPulseVal) hudPulseVal.textContent = pulseCount.toString();
          flashHud(hudPulseVal);
          FX.corePulseFeedback(playerSprite);
          energizeMatrix();
        }
      } else {
        pulseCount++;
        if (hudPulseVal) hudPulseVal.textContent = pulseCount.toString();
        flashHud(hudPulseVal);
        FX.corePulseFeedback(playerSprite);
        energizeMatrix();
      }
      saveRunSnapshot();
    }

    if (type === 3) {
      // v0.5.14：通關條件改為「至少 1 個 Core Pulse ＋ 抵達出口」，不能單純衝到出口就過關
      if (pulseCount >= 1) {
        isGameOver = true;
        clearRunSnapshot();
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
    playerPos = Render3D.buildWorld(mazeData);

    world.appendChild(playerDiv);
    updatePlayerDOM();
    EnemyLogic.init(enemyRoute, 'villainHunt');

    currentSpeed = baseSpeed;
    isGameOver = false;
    EnemyLogic.alertRadius = EnemyLogic.baseAlertRadius;

    shardCount = 0;
    pulseCount = 0;
    if (hudShardVal) hudShardVal.textContent = '00';
    if (hudPulseVal) hudPulseVal.textContent = '0';

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

  // v0.5.14: Stage Briefing 進場畫面，按下 ENTER STAGE 01 才開始遊戲迴圈
  const briefingOverlay = document.getElementById('stage-briefing');
  const briefingEnterBtn = document.getElementById('briefing-enter-btn');

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
