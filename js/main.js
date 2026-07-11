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
  let lastTime = performance.now();

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

  // v0.5.19/v0.5.20: 拿到 Core Pulse 瞬間，迷宮矩陣接縫灌滿金色霓虹光、反應裝甲牆體跳秒冷卻，
  // class 要留到跳秒動畫（3.5s）播完才拿掉，keyframes 動畫必須整段時間都符合這個 class 才會持續播放
  function energizeMatrix() {
    if (!world) return;
    world.classList.add('energized');
    setTimeout(() => world.classList.remove('energized'), 3600);
  }

  const pristineMazeData = JSON.parse(JSON.stringify(MazeLogic.getTestCorridor()));
  let mazeData = JSON.parse(JSON.stringify(pristineMazeData));
  let playerPos = Render3D.buildWorld(mazeData);

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
          FX.triggerSpeedBoost(600, playerSprite);
          energizeMatrix();
        }
      } else {
        pulseCount++;
        if (hudPulseVal) hudPulseVal.textContent = pulseCount.toString();
        flashHud(hudPulseVal);
        FX.triggerSpeedBoost(2500, playerSprite);
        energizeMatrix();
      }
    }

    if (type === 3) {
      // v0.5.14：通關條件改為「至少 1 個 Core Pulse ＋ 抵達出口」，不能單純衝到出口就過關
      if (pulseCount >= 1) {
        isGameOver = true;
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
    const dt = time - lastTime;
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
