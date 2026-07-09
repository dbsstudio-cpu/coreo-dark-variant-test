// js/main.js
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  ControlLogic.init();
  CameraLogic.init();

  const mazeData = MazeLogic.getTestCorridor();
  const playerPos = Render3D.buildWorld(mazeData);

  const world = document.getElementById('world');
  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';
  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite';
  playerDiv.appendChild(playerSprite);
  world.appendChild(playerDiv);

  const CELL_SIZE = Render3D.CELL_SIZE;
  const PLAYER_RADIUS = 24;
  let baseSpeed = 4.2;
  let currentSpeed = baseSpeed;
  let isGameOver = false;
  let playerBumpCooldown = 0; // ?脤???

  // Enemy patrol keeps local pressure, then switches to a slow clumsy chase when the player gets close.
  const enemyStart = { x: 1.5 * CELL_SIZE, y: 30.5 * CELL_SIZE };
  const patrolRoute = [
    { x: 1.5 * CELL_SIZE, y: 27.5 * CELL_SIZE },
    { x: 1.5 * CELL_SIZE, y: 30.5 * CELL_SIZE },
    { x: 3.5 * CELL_SIZE, y: 30.5 * CELL_SIZE },
    { x: 3.5 * CELL_SIZE, y: 28.5 * CELL_SIZE }
  ];
  EnemyLogic.init(enemyStart, null, null, patrolRoute);

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
    // 外層只管 left/top，不再寫入 transform（transform 固定寫死在 CSS 的 .actor 規則）
    playerDiv.style.left = `${playerPos.x}px`;
    playerDiv.style.top = `${playerPos.y}px`;
  }

  function checkPickups() {
    const cx = Math.floor(playerPos.x / CELL_SIZE);
    const cy = Math.floor(playerPos.y / CELL_SIZE);
    const type = mazeData[cy][cx];

    // 銝?祈?撘瑕??賡??園?嚗ype 6 頨脰??寞局銝?鋡急??歹?
    if (type === 4 || type === 5) {
      mazeData[cy][cx] = 1;
      const coreDOM = document.getElementById(`core-${cx}-${cy}`);
      if (coreDOM) FX.collectCore(coreDOM, playerSprite, type);

      if (type === 5) {
        // 撘瑕??賡?嚗漲憓? 1.5 ???晷??撘勗?
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

  let lastTime = performance.now();

  function gameLoop(time) {
    if (isGameOver) return;
    const dt = time - lastTime;
    lastTime = time;
    const timeScale = dt / 16.66; // ?箸??宏??
    // 1. ?拙振蝘餃?
    const vec = ControlLogic.getVector();
    if (vec.x !== 0 || vec.y !== 0) {
      let nextX = playerPos.x + vec.x * currentSpeed * timeScale;
      let nextY = playerPos.y + vec.y * currentSpeed * timeScale;
      let movedX = false, movedY = false;
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

    // 2. ?斗?拙振?臬??Type 6 頨脰??寞局
    const cx = Math.floor(playerPos.x / CELL_SIZE);
    const cy = Math.floor(playerPos.y / CELL_SIZE);
    const isPlayerHidden = (mazeData[cy] && mazeData[cy][cx] === 6);

    // 3. ?湔?晷?摩
    EnemyLogic.update(playerPos, isPlayerHidden, dt, mazeData, CELL_SIZE);

    // 4. ?斗?拙振??瘣曄??頛凝蝣唳??脩蔑嚗 Game Over嚗?    if (playerBumpCooldown > 0) playerBumpCooldown -= dt;
    const distToEnemy = Math.hypot(playerPos.x - EnemyLogic.x, playerPos.y - EnemyLogic.y);
    if (distToEnemy < PLAYER_RADIUS + EnemyLogic.radius) {
      if (playerBumpCooldown <= 0) {
        FX.wallBump(playerSprite); // ????
        playerBumpCooldown = 1000;
      }
    }

    CameraLogic.update(playerPos.y);
    requestAnimationFrame(gameLoop);
  }

  updatePlayerDOM();
  requestAnimationFrame(gameLoop);
});



