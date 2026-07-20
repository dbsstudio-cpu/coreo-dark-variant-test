window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  ControlLogic.init();
  CameraLogic.init();

  const CELL_SIZE = Render3D.CELL_SIZE;
  const RAIL_NODE_EPSILON = 0.05;
  let playerPos = Render3D.buildWorld(Stage03Ring.map, 3);
  let railDirection = null;
  let lastRailDirection = null;
  let lastControlCommandId = ControlLogic.commandId;

  // 環形狀態機 (這就是 Stage03 的核心擴充層)
  let ringState = {
    active: false,
    direction: null, // 'CW' | 'CCW'
    reservedExitDir: null
  };

  const world = document.getElementById('world');
  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';
  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite player-idle';
  playerDiv.appendChild(playerSprite);
  world.appendChild(playerDiv);

  CameraLogic.refreshMetrics();
  CameraLogic.setDirection('down', 0.44);

  // 渲染柔化圓環 SVG (無需修改 Render3D)
  function applyRingVisuals() {
    world.classList.add('stage-03');
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.style.position = 'absolute'; svg.style.inset = '0';
    svg.style.width = '100%'; svg.style.height = '100%';
    svg.style.pointerEvents = 'none'; svg.style.zIndex = '5';

    // 主環
    const path = document.createElementNS(svgNS, "path");
    let d = "";
    Stage03Ring.ringPath.forEach((cell, i) => {
      const cx = cell.x * CELL_SIZE + CELL_SIZE/2;
      const cy = cell.y * CELL_SIZE + CELL_SIZE/2;
      d += i === 0 ? `M ${cx} ${cy} ` : `L ${cx} ${cy} `;
    });
    d += "Z";
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#43D9FF");
    path.setAttribute("stroke-width", "34");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("class", "ring-track");
    svg.appendChild(path);

    // 右側短廊出口
    const exitPath = document.createElementNS(svgNS, "path");
    exitPath.setAttribute("d", `M ${10 * CELL_SIZE + 25} ${9 * CELL_SIZE + 25} L ${12 * CELL_SIZE + 25} ${9 * CELL_SIZE + 25}`);
    exitPath.setAttribute("fill", "none");
    exitPath.setAttribute("stroke", "#43D9FF");
    exitPath.setAttribute("stroke-width", "34");
    exitPath.setAttribute("stroke-linejoin", "round");
    exitPath.setAttribute("class", "ring-track");
    svg.appendChild(exitPath);

    world.appendChild(svg);
  }
  applyRingVisuals();

  function isSameDirection(a, b) { return !!(a && b && a.x === b.x && a.y === b.y); }
  function isOppositeDirection(a, b) { return !!(a && b && a.x === -b.x && a.y === -b.y); }
  function railCellOf(val) { return Math.floor(val / CELL_SIZE); }
  function railCenterOf(cell) { return cell * CELL_SIZE + CELL_SIZE / 2; }
  function currentRailCell() { return { x: railCellOf(playerPos.x), y: railCellOf(playerPos.y) }; }

  // 處理控制輸入
  function applyControlDirection(direction) {
    if (!direction) return;
    const cell = currentRailCell();
    const ringNode = Stage03Ring.RingMap[`${cell.x},${cell.y}`];

    // 如果身在環上
    if (ringNode) {
      const isCW = isSameDirection(direction, ringNode.cw);
      const isCCW = isSameDirection(direction, ringNode.ccw);

      // 1. 同切線方向 -> 順順接管
      if (isCW || isCCW) {
        ringState.active = true;
        ringState.direction = isCW ? 'CW' : 'CCW';
        ringState.reservedExitDir = null;
        railDirection = { ...direction };
        return;
      }

      // 2. 完全反向撥動 -> 允許反轉無震盪
      const currentMove = ringState.direction === 'CW' ? ringNode.cw : ringNode.ccw;
      if (isOppositeDirection(direction, currentMove) && ringState.active) {
        ringState.direction = ringState.direction === 'CW' ? 'CCW' : 'CW';
        ringState.reservedExitDir = null;
        railDirection = { x: -railDirection.x, y: -railDirection.y };
        return;
      }

      // 3. 側撥判斷 (計算 Dot Product 判定是指向環心或指外)
      const dot = direction.x * (Stage03Ring.centerX - cell.x) + direction.y * (Stage03Ring.centerY - cell.y);
      if (dot > 0) {
        // 向內側撥 -> 意圖為「切換繞行方向」
        if (ringState.active) {
          ringState.direction = ringState.direction === 'CW' ? 'CCW' : 'CW';
          ringState.reservedExitDir = null;
          railDirection = { x: -railDirection.x, y: -railDirection.y };
        }
      } else {
        // 向外側撥 -> 意圖為「預約出口」
        ringState.reservedExitDir = { ...direction };

        // 若此時在原地沒動 (停著)，且該格有對應出口，立即生效離開
        if (!ringState.active && ringNode.exits.some(e => isSameDirection(e, direction))) {
          railDirection = { ...direction };
          ringState.active = false;
          ringState.reservedExitDir = null;
        }
      }
      return;
    }

    // 不在環上：走 v0.10.5 正常四向 (測試版簡化直行碰撞)
    if (!railDirection || isOppositeDirection(direction, railDirection) || isSameDirection(direction, railDirection)) {
      railDirection = { ...direction };
    }
  }

  function consumeControlCommands() {
    const commands = ControlLogic.getCommandsAfter(lastControlCommandId);
    for (const cmd of commands) {
      lastControlCommandId = cmd.id;
      if (cmd.type === 'stop') {
        railDirection = null; // 放開即停 (保留 ringState)
      } else if (cmd.type === 'direction') {
        applyControlDirection(cmd.direction);
      }
    }
  }

  // 接管的 Rails Movement
  function movePlayerAlongRails(distance) {
    let remaining = distance;
    let moved = false;
    let guard = 0;

    while (remaining > 0.01 && railDirection && guard++ < 8) {
      const axis = railDirection.x !== 0 ? 'x' : 'y';
      const sign = railDirection[axis];
      const center = railCenterOf(railCellOf(playerPos[axis]));
      const delta = center - playerPos[axis];

      // 抵達網格中心點
      if (Math.abs(delta) <= RAIL_NODE_EPSILON) {
        playerPos[axis] = center;
        const cell = currentRailCell();
        const ringNode = Stage03Ring.RingMap[`${cell.x},${cell.y}`];

        // 核心機制：在環上自動導航
        if (ringNode) {
          if (ringState.active) {
            // A. 身上有預約，且該格有對應出口 -> 轉出離環
            if (ringState.reservedExitDir && ringNode.exits.some(e => isSameDirection(e, ringState.reservedExitDir))) {
              railDirection = { ...ringState.reservedExitDir };
              ringState.active = false;
              ringState.reservedExitDir = null;
            } else {
              // B. 繼續沿環自動切換軌道方向
              const nextDir = ringState.direction === 'CW' ? ringNode.cw : ringNode.ccw;
              if (!isSameDirection(railDirection, nextDir)) {
                railDirection = { ...nextDir };
              }
            }
          }
        } else {
          ringState.active = false; // 已離開環區
        }

        const nextCell = { x: cell.x + railDirection.x, y: cell.y + railDirection.y };
        if (Stage03Ring.map[nextCell.y]?.[nextCell.x] === 0 || Stage03Ring.map[nextCell.y]?.[nextCell.x] === 7) {
          railDirection = null; // 撞牆
          break;
        }

        // [修正處] 重算轉向後實際該移動的新軸向與符號
        const moveAxis = railDirection.x !== 0 ? 'x' : 'y';
        const moveSign = railDirection[moveAxis];
        const step = Math.min(remaining, CELL_SIZE);
        playerPos[moveAxis] += moveSign * step;
        remaining -= step;
        moved = true;
        continue;
      }

      if (delta * sign > 0) {
        const step = Math.min(remaining, Math.abs(delta));
        playerPos[axis] += sign * step;
        remaining -= step;
        moved = true;
        continue;
      }

      const nextCenter = center + sign * CELL_SIZE;
      const step = Math.min(remaining, Math.abs(nextCenter - playerPos[axis]));
      playerPos[axis] += sign * step;
      remaining -= step;
      moved = true;
    }
    return moved;
  }

  let prevCell = { x: -1, y: -1 };
  let lastFrameTime = performance.now();

  function gameLoop(time) {
    const dt = Math.min(time - lastFrameTime, 34);
    lastFrameTime = time;

    consumeControlCommands();

    if (railDirection) {
      if (movePlayerAlongRails(4.2 * (dt / 16.66))) {
        playerDiv.style.left = `${playerPos.x}px`;
        playerDiv.style.top = `${playerPos.y}px`;
      }
    }

    // 意圖失效判斷：如果離開了該出口格
    const newCell = currentRailCell();
    if (prevCell.x !== newCell.x || prevCell.y !== newCell.y) {
      const prevNode = Stage03Ring.RingMap[`${prevCell.x},${prevCell.y}`];
      if (prevNode && ringState.reservedExitDir) {
        if (prevNode.exits.some(e => isSameDirection(e, ringState.reservedExitDir))) {
          ringState.reservedExitDir = null;
          console.log("[Ring] 已通過預約出口，意圖失效。");
        }
      }
      prevCell = newCell;
    }

    // 通關重置
    if (Stage03Ring.map[newCell.y][newCell.x] === 3 || newCell.x >= 12) {
      console.log("[Ring] 抵達出口，測試重置。");
      playerPos = Render3D.buildWorld(Stage03Ring.map, 3);
      applyRingVisuals();

      // [修正處] buildWorld 清空了世界，必須把 playerDiv 重新插回去
      world.appendChild(playerDiv);

      railDirection = null;
      ringState.active = false;
      ringState.reservedExitDir = null;
      playerDiv.style.left = `${playerPos.x}px`;
      playerDiv.style.top = `${playerPos.y}px`;
    }

    CameraLogic.update(playerPos.y, dt);
    requestAnimationFrame(gameLoop);
  }

  playerDiv.style.left = `${playerPos.x}px`;
  playerDiv.style.top = `${playerPos.y}px`;
  requestAnimationFrame(gameLoop);
});
