// js/cc_main.js — CC Control Lab R1：軌道式移動（rail movement）
// 根因判斷：v0.9.5 是「自由類比移動＋方形碰撞」，走廊 50px、角色碰撞 42px，
// 單側只剩 4px 容錯——急轉彎要在瞬間把角色對準 4px 窗口，物理上不可能穩定做到，
// R3 加大到 9px 也一樣。這裡直接換移動模型：角色永遠鎖在走廊中心線上，
// 輸入只決定方向，轉彎由系統在路口節點自動對齊執行，「對不準」從根本上消失。
//
// 轉彎三機制：
// 1. 預輸入（早按）：路口前先撥方向，抵達第一個可轉路口自動完成轉彎（按住期間一直有效）。
// 2. 轉角回撈（晚按）：剛滑過路口中心 ≤ BACK_WINDOW 才撥方向，直接回貼路口中心完成轉彎。
// 3. 即時反向：同軸反方向隨時立即生效，不需要等路口。
// 放開手指：滑行到下一個格心停下（保持「永遠停在中心線節點」的軌道不變量）。
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

  const CELL = Render3D.CELL_SIZE;
  const SPEED = 4.2;                 // 與正式版同速，手感基準一致
  const MAX_FRAME_DT = 34;
  const BACK_WINDOW = CELL * 0.42;   // 晚按回撈窗口（約 21px）

  const zone = document.getElementById('cc-touch-zone');
  CCControl.init(zone);
  CameraLogic.init();

  const world = document.getElementById('world');
  const debugEl = document.getElementById('cc-debug');

  // ---- 場景管理 ----
  const SCENARIOS = {
    s1: { stage: 1, exitDirection: 'up', label: 'STAGE 01', getMap: () => MazeLogic.getStage01Map() },
    s2: { stage: 2, exitDirection: 'down', label: 'STAGE 02', getMap: () => MazeLogic.getStage02Map() },
    // 凹槽急轉專用：從 Stage02 的 3 格深躲藏凹槽(1,16)出發，
    // 往下離開凹槽後在 (1,17) 立即右轉，是 Sean 描述的失敗情境本體
    pocket: { stage: 2, exitDirection: 'down', label: 'POCKET 急轉', getMap: () => MazeLogic.getStage02Map(), startCell: { x: 1, y: 16 } }
  };

  let mazeData = null;
  let pos = { x: 0, y: 0 };
  let dir = null;         // 現行移動方向 {x,y} 或 null
  let buffered = null;    // 預輸入的垂直轉向
  let releaseGlide = false; // 放開手指後滑行到下一個節點停止
  let lastTime = performance.now();

  const playerDiv = document.createElement('div');
  playerDiv.id = 'player';
  playerDiv.className = 'actor';
  const playerSprite = document.createElement('div');
  playerSprite.className = 'actor-sprite player-idle';
  playerDiv.appendChild(playerSprite);

  function isOpen(cx, cy) {
    if (!mazeData || cy < 0 || cy >= mazeData.length || cx < 0 || cx >= mazeData[0].length) return false;
    return mazeData[cy][cx] !== 0; // 與正式版一致：只有 0 是牆，6/7 凹槽可走
  }

  function cellOf(v) { return Math.floor(v / CELL); }
  function centerOf(c) { return c * CELL + CELL / 2; }

  function currentCell() { return { x: cellOf(pos.x), y: cellOf(pos.y) }; }

  function openFrom(cell, d) { return isOpen(cell.x + d.x, cell.y + d.y); }

  function loadScenario(key) {
    const sc = SCENARIOS[key];
    if (!sc) return;
    mazeData = JSON.parse(JSON.stringify(sc.getMap()));
    const startPos = Render3D.buildWorld(mazeData, sc.stage);
    world.className = `stage-0${sc.stage}`;
    document.body.classList.toggle('stage-02-active', sc.stage === 2);
    if (sc.startCell) {
      pos = { x: centerOf(sc.startCell.x), y: centerOf(sc.startCell.y) };
    } else {
      pos = { x: startPos.x, y: startPos.y };
    }
    dir = null;
    buffered = null;
    releaseGlide = false;
    world.appendChild(playerDiv);
    CameraLogic.refreshMetrics();
    CameraLogic.setDirection(sc.exitDirection);
    updatePlayerDOM();
    const label = document.getElementById('cc-scenario-label');
    if (label) label.textContent = sc.label;
  }

  function updatePlayerDOM() {
    playerDiv.style.left = `${pos.x}px`;
    playerDiv.style.top = `${pos.y}px`;
  }

  // ---- 意圖處理 ----
  function isOpposite(a, b) { return a && b && a.x === -b.x && a.y === -b.y; }
  function isPerpendicular(a, b) { return a && b && (a.x !== 0) !== (b.x !== 0); }
  function sameDir(a, b) { return a && b && a.x === b.x && a.y === b.y; }

  function handleIntent(intent) {
    if (!intent) {
      if (!CCControl.isActive) {
        // 放開手指：進入滑行收尾，滑到下一個節點停下
        if (dir) releaseGlide = true;
        buffered = null;
      }
      // 手指按著但在死區：沿用現行方向繼續走，不清空
      return;
    }
    releaseGlide = false;

    if (!dir) {
      // 靜止起步：軌道不變量保證此刻一定停在某個格心節點上
      const cell = currentCell();
      if (openFrom(cell, intent)) {
        dir = intent;
      } else {
        // 起步方向是牆：記為預輸入，玩家接著撥其他方向時自然接手
        buffered = null;
      }
      return;
    }

    if (sameDir(intent, dir)) { buffered = null; return; }

    if (isOpposite(intent, dir)) {
      // 同軸反向：立即生效（軸線上兩側格都在走廊內，安全）
      dir = intent;
      buffered = null;
      return;
    }

    if (isPerpendicular(intent, dir)) {
      // 晚按回撈：剛滑過路口中心一小段，直接回貼中心完成轉彎
      const axis = dir.x !== 0 ? 'x' : 'y';
      const s = axis === 'x' ? dir.x : dir.y;
      const c = cellOf(pos[axis]);
      const center = centerOf(c);
      const passed = (pos[axis] - center) * s; // >0 表示已滑過中心
      const cell = currentCell();
      if (passed > 0.01 && passed <= BACK_WINDOW && openFrom(cell, intent)) {
        pos[axis] = center;
        dir = intent;
        buffered = null;
        return;
      }
      // 早按預輸入：抵達下一個可轉路口自動執行
      buffered = intent;
    }
  }

  // ---- 軌道移動 ----
  function moveAlongRails(dist) {
    let remaining = dist;
    let guard = 0;
    while (remaining > 0.01 && dir && guard++ < 8) {
      const axis = dir.x !== 0 ? 'x' : 'y';
      const s = axis === 'x' ? dir.x : dir.y;
      const c = cellOf(pos[axis]);
      const center = centerOf(c);
      const delta = center - pos[axis];
      const atNode = Math.abs(delta) <= 0.01;

      if (atNode) {
        // 節點決策：先吃預輸入轉向，再確認前方是否可走
        const cell = currentCell();
        if (releaseGlide) { dir = null; releaseGlide = false; break; }
        if (buffered && openFrom(cell, buffered)) {
          dir = buffered;
          buffered = null;
          continue;
        }
        if (!openFrom(cell, dir)) { dir = null; break; } // 前方是牆：停在節點
        // 通過節點，往下一個格心推進
        const step = Math.min(remaining, CELL);
        pos[axis] += s * step;
        remaining -= step;
        continue;
      }

      if (delta * s > 0) {
        // 正在接近本格中心：先走到中心（下一輪迴圈做節點決策）
        const step = Math.min(remaining, Math.abs(delta));
        pos[axis] += s * step;
        remaining -= step;
        continue;
      }

      // 已過中心、往格界推進：通過性在上一個節點已驗證過，安全
      const nextCenter = center + s * CELL;
      const step = Math.min(remaining, Math.abs(nextCenter - pos[axis]));
      pos[axis] += s * step;
      remaining -= step;
    }
  }

  // ---- 主迴圈 ----
  function frame(time) {
    const dt = Math.min(time - lastTime, MAX_FRAME_DT);
    lastTime = time;
    const timeScale = dt / 16.66;

    handleIntent(CCControl.getIntent());
    if (dir) {
      moveAlongRails(SPEED * timeScale);
      updatePlayerDOM();
    }

    CameraLogic.update(pos.y);

    if (debugEl) {
      const fmt = (d) => d ? (d.x === 1 ? '→' : d.x === -1 ? '←' : d.y === 1 ? '↓' : '↑') : '·';
      debugEl.textContent = `DIR ${fmt(dir)}  BUF ${fmt(buffered)}`;
    }
    requestAnimationFrame(frame);
  }

  // ---- 場景按鈕 ----
  document.querySelectorAll('[data-scenario]').forEach((btn) => {
    btn.addEventListener('click', () => loadScenario(btn.dataset.scenario));
  });

  // ---- 測試掛勾：桌面自動測試用，不依賴 rAF（背景分頁 rAF 會被節流），正式整合時整段移除 ----
  window.CCLab = {
    step: (ms) => {
      handleIntent(CCControl.getIntent());
      if (dir) {
        moveAlongRails(SPEED * (ms / 16.66));
        updatePlayerDOM();
      }
    },
    setIntent: (x, y, active = true) => {
      CCControl.isActive = active;
      CCControl.intentX = x;
      CCControl.intentY = y;
    },
    getState: () => ({
      pos: { x: pos.x, y: pos.y },
      cell: currentCell(),
      dir: dir ? { ...dir } : null,
      buffered: buffered ? { ...buffered } : null,
      releaseGlide
    }),
    loadScenario
  };

  const params = new URLSearchParams(location.search);
  loadScenario(params.get('scenario') || 's2');
  requestAnimationFrame(frame);
});
