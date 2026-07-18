// js/cc_diagnostic_main.js — COREO CC Diagnostic v0.9.7-D1
// 一次性命令消費 + rail 狀態機；正式 v0.9.5、R1 與 R3 均不引用本檔。
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

  const VERSION = 'COREO CC DIAGNOSTIC v0.9.7-D1';
  const CELL = Render3D.CELL_SIZE;
  const SPEED = 4.2;
  const MAX_FRAME_DT = 34;
  const BACK_WINDOW = CELL * 0.42;
  const NODE_EPSILON = 0.05;
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const zone = document.getElementById('cc-touch-zone');
  const world = document.getElementById('world');
  const gameContainer = document.getElementById('game-container');
  const debugEl = document.getElementById('cc-debug');
  const inputVisual = document.getElementById('cc-input-visual');
  const inputArrow = document.getElementById('cc-input-arrow');
  const scenarioLabel = document.getElementById('cc-scenario-label');
  CCDiagnosticControl.init(zone);
  CameraLogic.init();

  const railMap = () => [
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [1, 1, 2, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0]
  ];
  const mirroredStage02 = () => MazeLogic.getStage02Map().map((row) => row.slice().reverse());
  const SCENARIOS = {
    input: { label: '01 純輸入｜無牆、無 rail、無 Camera', inputOnly: true },
    rail: { label: '02 單一路口 RAIL', stage: 1, map: railMap, startCell: { x: 2, y: 2 }, exitDirection: 'down' },
    pocketRight: { label: '03A STAGE 02 凹槽｜出槽右轉', stage: 2, map: () => MazeLogic.getStage02Map(), startCell: { x: 1, y: 16 }, exitDirection: 'down' },
    pocketLeft: { label: '03B STAGE 02 鏡像凹槽｜出槽左轉', stage: 2, map: mirroredStage02, startCell: { x: 7, y: 16 }, exitDirection: 'down' }
  };

  let currentScenario = 'input';
  let mazeData = null;
  let pos = { x: 0, y: 0 };
  let desiredDirection = null;
  let moveDirection = null;
  let queuedDirection = null;
  let lastRailDirection = null;
  let blockedReason = 'NONE';
  let lastConsumedId = 0;
  let consumedCount = 0;
  let pendingExecution = null;
  let lastExecuteLatency = 0;
  let traceEntries = [];
  let lastTime = performance.now();

  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';
  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite player-idle';
  playerDiv.appendChild(playerSprite);

  function cloneDir(d) { return d ? { x: d.x, y: d.y } : null; }
  function sameDir(a, b) { return !!(a && b && a.x === b.x && a.y === b.y); }
  function isOpposite(a, b) { return !!(a && b && a.x === -b.x && a.y === -b.y); }
  function isPerpendicular(a, b) { return !!(a && b && (a.x !== 0) !== (b.x !== 0)); }
  function sameAxis(a, b) { return !!(a && b && (a.x !== 0) === (b.x !== 0)); }
  function cellOf(v) { return Math.floor(v / CELL); }
  function centerOf(c) { return c * CELL + CELL / 2; }
  function currentCell() { return { x: cellOf(pos.x), y: cellOf(pos.y) }; }
  function isCentered(v) { return Math.abs(v - centerOf(cellOf(v))) <= NODE_EPSILON; }
  function isAtNode() { return isCentered(pos.x) && isCentered(pos.y); }
  function isOpen(cx, cy) {
    return !!(mazeData && cy >= 0 && cy < mazeData.length && cx >= 0 && cx < mazeData[0].length && mazeData[cy][cx] !== 0);
  }
  function openFrom(cell, direction) { return !!(direction && isOpen(cell.x + direction.x, cell.y + direction.y)); }
  function fmt(d) { return d ? (d.x === 1 ? '→' : d.x === -1 ? '←' : d.y === 1 ? '↓' : '↑') : '·'; }
  function ms(value) { return Number.isFinite(value) ? `${value.toFixed(1)}ms` : '—'; }

  function addTrace(text) {
    traceEntries.push(text);
    if (traceEntries.length > 6) traceEntries.shift();
  }

  function markExecuted(now = performance.now()) {
    if (!pendingExecution) return;
    lastExecuteLatency = Math.max(0, now - pendingExecution.timestamp);
    const executedLabel = pendingExecution.direction ? fmt(pendingExecution.direction) : 'STOP';
    addTrace(`#${pendingExecution.id} EXEC ${executedLabel} ${lastExecuteLatency.toFixed(1)}ms`);
    pendingExecution = null;
  }

  function snapMovingAxisToNode(direction) {
    const axis = direction && direction.x !== 0 ? 'x' : 'y';
    pos[axis] = centerOf(cellOf(pos[axis]));
  }

  function applyDirectionCommand(command, now) {
    const direction = cloneDir(command.direction);
    desiredDirection = direction;
    pendingExecution = { id: command.id, timestamp: command.timestamp, direction: cloneDir(direction) };
    addTrace(`#${command.id} ACCEPT ${fmt(direction)}`);

    if (SCENARIOS[currentScenario].inputOnly) {
      blockedReason = 'INPUT_ONLY';
      markExecuted(now);
      return;
    }

    if (!moveDirection) {
      if (isAtNode()) {
        if (openFrom(currentCell(), direction)) {
          moveDirection = direction;
          lastRailDirection = cloneDir(direction);
          queuedDirection = null;
          blockedReason = 'NONE';
          markExecuted(now);
        } else {
          queuedDirection = cloneDir(direction);
          blockedReason = 'WALL_BLOCKED';
          addTrace(`#${command.id} QUEUE ${fmt(direction)} WALL_BLOCKED`);
        }
        return;
      }

      // 放開即停可能停在節點之間；只能沿既有 rail 軸重啟，不能橫切牆體。
      if (lastRailDirection && sameAxis(direction, lastRailDirection)) {
        moveDirection = direction;
        lastRailDirection = cloneDir(direction);
        queuedDirection = null;
        blockedReason = 'NONE';
        markExecuted(now);
      } else {
        queuedDirection = cloneDir(direction);
        blockedReason = 'NOT_AT_NODE';
        addTrace(`#${command.id} QUEUE ${fmt(direction)} NOT_AT_NODE`);
      }
      return;
    }

    if (sameDir(direction, moveDirection)) {
      queuedDirection = null;
      blockedReason = 'NONE';
      markExecuted(now);
      return;
    }

    if (isOpposite(direction, moveDirection)) {
      moveDirection = direction;
      lastRailDirection = cloneDir(direction);
      queuedDirection = null;
      blockedReason = 'NONE';
      markExecuted(now);
      return;
    }

    if (isPerpendicular(direction, moveDirection)) {
      const oldDirection = cloneDir(moveDirection);
      const axis = oldDirection.x !== 0 ? 'x' : 'y';
      const sign = axis === 'x' ? oldDirection.x : oldDirection.y;
      const center = centerOf(cellOf(pos[axis]));
      const passed = (pos[axis] - center) * sign;
      const canTurnHere = openFrom(currentCell(), direction);

      if (isAtNode() && canTurnHere) {
        moveDirection = direction;
        lastRailDirection = cloneDir(direction);
        queuedDirection = null;
        blockedReason = 'NONE';
        markExecuted(now);
      } else if (passed > NODE_EPSILON && passed <= BACK_WINDOW && canTurnHere) {
        snapMovingAxisToNode(oldDirection);
        moveDirection = direction;
        lastRailDirection = cloneDir(direction);
        queuedDirection = null;
        blockedReason = 'NONE';
        markExecuted(now);
      } else {
        queuedDirection = direction;
        blockedReason = isAtNode() ? 'NO_LEGAL_EDGE' : 'NOT_AT_NODE';
        addTrace(`#${command.id} QUEUE ${fmt(direction)} ${blockedReason}`);
      }
    }
  }

  function applyStopCommand(command, now) {
    desiredDirection = null;
    moveDirection = null;
    queuedDirection = null;
    pendingExecution = { id: command.id, timestamp: command.timestamp, direction: null };
    blockedReason = command.source === 'pointercancel' || command.source === 'touchcancel' ? 'POINTER_CANCELLED' : 'RELEASED';
    markExecuted(now);
  }

  function consumePendingCommands(now = performance.now()) {
    const commands = CCDiagnosticControl.getCommandsAfter(lastConsumedId);
    if (!commands.length) return false;
    commands.forEach((command) => {
      lastConsumedId = command.id;
      consumedCount += 1;
      if (command.type === 'stop') applyStopCommand(command, now);
      else applyDirectionCommand(command, now);
    });
    return true;
  }

  function moveAlongRails(distance, now = performance.now()) {
    let remaining = distance;
    let guard = 0;
    while (remaining > 0.01 && moveDirection && guard++ < 8) {
      const axis = moveDirection.x !== 0 ? 'x' : 'y';
      const sign = axis === 'x' ? moveDirection.x : moveDirection.y;
      const center = centerOf(cellOf(pos[axis]));
      const delta = center - pos[axis];
      const atNodeOnAxis = Math.abs(delta) <= NODE_EPSILON;

      if (atNodeOnAxis) {
        pos[axis] = center;
        const cell = currentCell();
        if (queuedDirection && openFrom(cell, queuedDirection)) {
          moveDirection = cloneDir(queuedDirection);
          lastRailDirection = cloneDir(moveDirection);
          queuedDirection = null;
          blockedReason = 'NONE';
          markExecuted(now);
          continue;
        }
        if (!openFrom(cell, moveDirection)) {
          moveDirection = null;
          blockedReason = queuedDirection ? 'NO_LEGAL_EDGE' : 'WALL_BLOCKED';
          break;
        }
        if (queuedDirection) blockedReason = 'WAITING_FOR_INTERSECTION';
        const step = Math.min(remaining, CELL);
        pos[axis] += sign * step;
        remaining -= step;
        continue;
      }

      if (delta * sign > 0) {
        const step = Math.min(remaining, Math.abs(delta));
        pos[axis] += sign * step;
        remaining -= step;
        continue;
      }

      const nextCenter = center + sign * CELL;
      const step = Math.min(remaining, Math.abs(nextCenter - pos[axis]));
      pos[axis] += sign * step;
      remaining -= step;
    }
  }

  function updatePlayerDOM() {
    playerDiv.style.left = `${pos.x}px`;
    playerDiv.style.top = `${pos.y}px`;
  }

  function loadScenario(key) {
    const scenario = SCENARIOS[key];
    if (!scenario) return;
    currentScenario = key;
    desiredDirection = null;
    moveDirection = null;
    queuedDirection = null;
    lastRailDirection = null;
    blockedReason = scenario.inputOnly ? 'INPUT_ONLY' : 'NONE';
    pendingExecution = null;
    lastExecuteLatency = 0;
    traceEntries = [];

    document.body.classList.toggle('cc-input-only', !!scenario.inputOnly);
    document.body.classList.toggle('stage-02-active', !scenario.inputOnly && scenario.stage === 2);
    gameContainer.hidden = !!scenario.inputOnly;
    inputVisual.hidden = !scenario.inputOnly;
    scenarioLabel.textContent = scenario.label;
    document.querySelectorAll('[data-scenario]').forEach((button) => button.classList.toggle('active', button.dataset.scenario === key));

    if (scenario.inputOnly) {
      mazeData = null;
      world.innerHTML = '';
      return;
    }

    mazeData = JSON.parse(JSON.stringify(scenario.map()));
    Render3D.buildWorld(mazeData, scenario.stage);
    world.className = `stage-0${scenario.stage}`;
    pos = { x: centerOf(scenario.startCell.x), y: centerOf(scenario.startCell.y) };
    world.appendChild(playerDiv);
    CameraLogic.refreshMetrics();
    CameraLogic.setDirection(scenario.exitDirection);
    CameraLogic.currentY = 0;
    updatePlayerDOM();
  }

  function updateDiagnostics(now) {
    const input = CCDiagnosticControl.getDiagnostics();
    const nodeState = SCENARIOS[currentScenario].inputOnly ? 'N/A' : (isAtNode() ? 'AT_NODE' : 'BETWEEN_NODES');
    const commandAge = input.commandTime ? now - input.commandTime : NaN;
    const executeLatency = pendingExecution ? now - pendingExecution.timestamp : lastExecuteLatency;
    debugEl.textContent = [
      `${VERSION}`,
      `RAW ${fmt(input.rawDirection)}  ACCEPT ${fmt(input.acceptedDirection)}  DESIRED ${fmt(desiredDirection)}`,
      `MOVE ${fmt(moveDirection)}  BUFFER ${fmt(queuedDirection)}  NODE ${nodeState}`,
      `BLOCKED ${blockedReason}`,
      `COMMAND #${input.commandId}  AGE ${ms(commandAge)}  CONSUMED #${lastConsumedId} / ${consumedCount}`,
      `EVENT Δt ${ms(input.lastEventInterval)}  DX ${input.lastDX.toFixed(1)}  DY ${input.lastDY.toFixed(1)}`,
      `INPUT ${ms(input.inputLatency)}  COMMAND→EXEC ${ms(executeLatency)}`,
      `END ${input.endReason}`,
      `TRACE ${traceEntries.slice(-4).join(' | ') || '—'}`
    ].join('\n');
    inputArrow.textContent = fmt(input.acceptedDirection);
    inputArrow.dataset.active = input.acceptedDirection ? 'true' : 'false';
  }

  function frame(time) {
    const dt = Math.min(Math.max(0, time - lastTime), MAX_FRAME_DT);
    lastTime = time;
    consumePendingCommands(time);
    if (moveDirection && !SCENARIOS[currentScenario].inputOnly) {
      moveAlongRails(SPEED * (dt / 16.66), time);
      updatePlayerDOM();
    }
    if (!SCENARIOS[currentScenario].inputOnly) CameraLogic.update(pos.y);
    updateDiagnostics(time);
    requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.addEventListener('click', () => loadScenario(button.dataset.scenario));
  });

  window.CCDiagnosticLab = {
    version: VERSION,
    loadScenario,
    step: (ms = 16.66) => {
      const now = performance.now();
      consumePendingCommands(now);
      if (moveDirection && !SCENARIOS[currentScenario].inputOnly) {
        moveAlongRails(SPEED * (ms / 16.66), now);
        updatePlayerDOM();
      }
      updateDiagnostics(now);
    },
    getState: () => ({
      scenario: currentScenario,
      pos: { x: pos.x, y: pos.y },
      cell: currentCell(),
      desiredDirection: cloneDir(desiredDirection),
      moveDirection: cloneDir(moveDirection),
      queuedDirection: cloneDir(queuedDirection),
      blockedReason,
      lastConsumedId,
      consumedCount,
      pendingExecution: pendingExecution ? { ...pendingExecution } : null,
      lastExecuteLatency,
      traceEntries: traceEntries.slice()
    })
  };

  const params = new URLSearchParams(location.search);
  loadScenario(params.get('scenario') || 'input');
  requestAnimationFrame(frame);
});
