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
  world.appendChild(playerDiv);

  const CELL_SIZE = Render3D.CELL_SIZE;
  const enemyDiv = document.createElement('div');
  enemyDiv.id = 'enemy';
  // 迷宮已退回 7 格寬，反派固定站在 v2.7 單一路線中段（col2, row11）有效路徑上
  enemyDiv.style.left = `${2 * CELL_SIZE + CELL_SIZE / 2}px`;
  enemyDiv.style.top = `${11 * CELL_SIZE + CELL_SIZE / 2}px`;
  enemyDiv.style.transform = `translate(-50%, -50%) translateZ(24px)`;
  world.appendChild(enemyDiv);
  const PLAYER_RADIUS = 24; // 從 18 提升到 24，配合 62px 的實體尺寸，保持順滑移動
  const SPEED = 4.2;
  let isGameOver = false;

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
    // 玩家本體稍微浮空，強化 3D 感
    playerDiv.style.transform = `translate(-50%, -50%) translateZ(24px)`;
  }

  function checkPickups() {
    const cx = Math.floor(playerPos.x / CELL_SIZE);
    const cy = Math.floor(playerPos.y / CELL_SIZE);
    const type = mazeData[cy][cx];

    if (type === 4 || type === 5) {
      mazeData[cy][cx] = 1; // 清空（一般能量與強化能量都適用）
      const coreDOM = document.getElementById(`core-${cx}-${cy}`);
      if (coreDOM) FX.collectCore(coreDOM);
    }

    if (type === 3) {
      isGameOver = true;
      FX.levelComplete();
    }
  }

  function gameLoop() {
    if (isGameOver) return;

    const vec = ControlLogic.getVector();
    if (vec.x !== 0 || vec.y !== 0) {
      let nextX = playerPos.x + vec.x * SPEED;
      let nextY = playerPos.y + vec.y * SPEED;

      let movedX = false, movedY = false;
      let hitWall = false;

      // X 軸滑動
      if (!checkCollision(nextX, playerPos.y)) { playerPos.x = nextX; movedX = true; }
      else { hitWall = true; }

      // Y 軸滑動
      if (!checkCollision(playerPos.x, nextY)) { playerPos.y = nextY; movedY = true; }
      else { hitWall = true; }

      if (hitWall) FX.wallBump(playerDiv);
      if (movedX || movedY) {
        updatePlayerDOM();
        checkPickups();
      }
    }

    // 更新鏡頭 (傳入玩家 Y 軸位置)
    CameraLogic.update(playerPos.y);
    requestAnimationFrame(gameLoop);
  }

  // 啟動
  updatePlayerDOM();
  requestAnimationFrame(gameLoop);
});




