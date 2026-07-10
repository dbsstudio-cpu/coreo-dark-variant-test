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

  // 反派巡邏路線：貫串巡邏教學區(Hall A/B/C) → 埋伏教學區(誤導型錯路) → 出口前壓力區(Hall G)
  // v0.5.2 修正：地圖每個 Hall 之間刻意設計了「誘導死路」（col3 在 row15→16、row21→22、row27→28
  // 會斷掉；Hall B↔Hall C 之間 row31 只有 col5 連通），舊路線全程固定用 x=3.5 會在 Hall B↔Hall C
  // 之間卡死。這裡依照 maze.js 實際連通性，在每個 Hall（整排都是路的寬敞格）內插入換車道的路徑點，
  // 換車道時停留在同一 y、只移動 x，確保每一段垂直移動都走在真正連通的欄位上。
  const enemyRoute = [
    { x: 3.5 * CELL_SIZE, y: 35.5 * CELL_SIZE }, // Hall A（巡邏教學起點）
    { x: 3.5 * CELL_SIZE, y: 32.5 * CELL_SIZE }, // Hall B，經 col3 抵達
    { x: 5.5 * CELL_SIZE, y: 32.5 * CELL_SIZE }, // Hall B 內換到 col5（Hall B↔Hall C 只有 col5 連通）
    { x: 5.5 * CELL_SIZE, y: 29.5 * CELL_SIZE }, // Hall C，經 col5 抵達
    { x: 1.5 * CELL_SIZE, y: 29.5 * CELL_SIZE }, // Hall C 內換到 col1（Hall C↔Hall D 只有 col1 連通，col3 是死路）
    { x: 1.5 * CELL_SIZE, y: 23.5 * CELL_SIZE }, // Hall D，經 col1 抵達
    { x: 5.5 * CELL_SIZE, y: 23.5 * CELL_SIZE }, // Hall D 內換到 col5（往上只有 col5 連通，col3 是死路）
    { x: 5.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }, // Hall E，經 col5 抵達
    { x: 1.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }, // Hall E 內換到 col1（埋伏區主通道）
    { x: 1.5 * CELL_SIZE, y: 10.5 * CELL_SIZE }, // 埋伏教學區入口（誤導型錯路旁，經 col1）
    { x: 5.5 * CELL_SIZE, y: 9.5 * CELL_SIZE },  // Hall F 內換到 col5（往上只有 col5 連通）
    { x: 3.5 * CELL_SIZE, y: 3.5 * CELL_SIZE },  // Hall G（出口前壓力區），經 col5 抵達後在寬敞區換回 col3
    { x: 5.5 * CELL_SIZE, y: 3.5 * CELL_SIZE },  // 折返：Hall G 內換回 col5
    { x: 5.5 * CELL_SIZE, y: 9.5 * CELL_SIZE },  // Hall F，經 col5
    { x: 1.5 * CELL_SIZE, y: 9.5 * CELL_SIZE },  // Hall F 內換回 col1
    { x: 1.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }, // Hall E，經 col1
    { x: 5.5 * CELL_SIZE, y: 17.5 * CELL_SIZE }, // Hall E 內換回 col5
    { x: 5.5 * CELL_SIZE, y: 23.5 * CELL_SIZE }, // Hall D，經 col5
    { x: 1.5 * CELL_SIZE, y: 23.5 * CELL_SIZE }, // Hall D 內換回 col1
    { x: 1.5 * CELL_SIZE, y: 29.5 * CELL_SIZE }, // Hall C，經 col1
    { x: 5.5 * CELL_SIZE, y: 29.5 * CELL_SIZE }, // Hall C 內換回 col5
    { x: 5.5 * CELL_SIZE, y: 32.5 * CELL_SIZE }, // Hall B，經 col5
    { x: 3.5 * CELL_SIZE, y: 32.5 * CELL_SIZE }  // Hall B 內換回 col3，回到 Hall A 完成一圈
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

    if (type === 4 || type === 5) {
      mazeData[cy][cx] = 1;
      const coreDOM = document.getElementById(`core-${cx}-${cy}`);
      if (coreDOM) FX.collectCore(coreDOM, playerSprite, type);

      if (type === 5) {
        currentSpeed = baseSpeed * 1.5;
        EnemyLogic.alertRadius = EnemyLogic.baseAlertRadius * 0.6;
        FX.triggerSpeedBoost(2500, playerSprite);

        setTimeout(() => {
          currentSpeed = baseSpeed;
          EnemyLogic.alertRadius = EnemyLogic.baseAlertRadius;
        }, 2500);
      }
    }

    if (type === 3) {
      isGameOver = true;
      FX.levelComplete();
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
  requestAnimationFrame(gameLoop);
});

