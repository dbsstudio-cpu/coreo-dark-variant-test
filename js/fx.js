// js/fx.js
const FX = {
  // v0.5.24：動能軌跡 Trail——在 world 座標系生成一個小殘光點，動畫播完自行移除，
  // 呼叫端要自行節流（不要每個 frame 都呼叫），避免大量 DOM 節點拖垮 Android 效能
  spawnTrail: function(worldEl, x, y) {
    if (!worldEl) return;
    const dot = document.createElement('div');
    dot.className = 'motion-trail';
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    worldEl.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  },

  // v0.6：Edge Lighting——局部生成一個小型發光元素貼在拾取點附近，播完自動移除，
  // 不碰任何既有 .cell 元素本身的 CSS 屬性，效能成本固定不隨地圖大小增加
  spawnEdgeLight: function(x, y, type) {
    const world = document.getElementById('world');
    if (!world) return;
    const light = document.createElement('div');
    light.className = `edge-light-fx fx-${type}`;
    light.style.left = `${x}px`;
    light.style.top = `${y}px`;
    world.appendChild(light);
    light.addEventListener('animationend', () => light.remove(), { once: true });
  },

  // v0.6.6：Core Pulse 矩陣線改成單一 overlay 圖層，不再讓所有 path/wall cell 同時改 box-shadow。
  spawnMatrixPulse: function(stageId) {
    const world = document.getElementById('world');
    if (!world) return;
    const pulse = document.createElement('div');
    pulse.className = `matrix-pulse-fx stage-0${stageId}`;
    world.appendChild(pulse);
    pulse.addEventListener('animationend', () => pulse.remove(), { once: true });
  },

  collectCore: function(coreDOM, spriteDOM, type) {
    const isBoost = type === 5;
    const uiCore = document.getElementById(isBoost ? 'ui-pulse-val' : 'ui-shard-val');
    const rect = coreDOM.getBoundingClientRect();
    const uiRect = uiCore.getBoundingClientRect();

    const particle = document.createElement('div');
    particle.style.position = 'fixed';
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.width = isBoost ? '14px' : '12px';
    particle.style.height = isBoost ? '14px' : '12px';
    particle.style.backgroundColor = isBoost ? 'var(--coreo-core-boost)' : 'var(--coreo-core-basic)';
    particle.style.borderRadius = isBoost ? '4px' : '50%';
    particle.style.boxShadow = isBoost ? '0 0 15px var(--coreo-core-boost)' : '0 0 15px var(--coreo-core-basic-glow)';
    particle.style.zIndex = '9999';
    particle.style.pointerEvents = 'none';
    document.body.appendChild(particle);

    coreDOM.remove();

    const flyStart = `translate(-50%, -50%) scale(1) ${isBoost ? 'rotate(45deg)' : ''}`;
    const flyEnd = `translate(${uiRect.left - rect.left}px, ${uiRect.top - rect.top}px) scale(0.5) ${isBoost ? 'rotate(45deg)' : ''}`;
    const animation = particle.animate([
      { transform: flyStart },
      { transform: flyEnd }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    });

    // v0.5.14: 計數與 HUD 文字改由 main.js 的 shardCount/pulseCount 統一管理，
    // 這裡只負責粒子飛行動畫與觸覺回饋，避免重複累加
    animation.onfinish = () => {
      particle.remove();
      if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
    };

    if (spriteDOM) {
      const animClass = isBoost ? 'player-collect-boost' : 'player-collect-basic';
      spriteDOM.classList.remove('player-collect-anim-4', 'player-collect-anim-5', 'player-collect-basic', 'player-collect-boost');
      void spriteDOM.offsetWidth;
      spriteDOM.classList.add(animClass, 'player-core-charged');
      setTimeout(() => {
        spriteDOM.classList.remove(animClass, 'player-core-charged');
      }, isBoost ? 850 : 560);
    }
  },

  wallBump: function(spriteDOM) {
    if (spriteDOM.classList.contains('shake')) return;
    spriteDOM.classList.add('shake');
    if ('vibrate' in navigator) navigator.vibrate(10);
    setTimeout(() => spriteDOM.classList.remove('shake'), 200);
  },

  // v0.5.15: 過關 Cinematic Zoom——主角先放大 3~4 倍 + 冰藍衝擊波，播完才彈出 STAGE SECURED
  // v0.6：exitDirection 決定放大脫離的方向（'up' 或 'down'），因為出口不再固定在地圖上方
  levelComplete: function(spriteDOM, actorDOM, exitDirection) {
    if ('vibrate' in navigator) navigator.vibrate([40, 30, 40, 30, 120]);

    // v0.6.4：往下飄的放大脫離動畫，下方可用空間比往上飄少，先解除 overflow:hidden 裁切，
    // 遊戲此時已經停止主迴圈、之後只會走向重新整理，放寬裁切不影響任何操控判定
    const gameContainer = document.getElementById('game-container');
    const cameraRig = document.getElementById('camera-rig');
    const world = document.getElementById('world');
    if (gameContainer) gameContainer.classList.add('victory-clear');
    if (cameraRig) cameraRig.classList.add('victory-clear');
    if (world) world.classList.add('victory-clear');

    // v0.6.7：過關主角放大改用 fixed clone，不再依賴 #world 內的 3D/camera/overflow 層。
    const actorRect = actorDOM ? actorDOM.getBoundingClientRect() : null;
    const clone = document.createElement('div');
    clone.className = `victory-player-clone ${exitDirection === 'down' ? 'player-victory-zoom-down' : 'player-victory-zoom'}`;
    if (actorRect) {
      clone.style.left = `${actorRect.left + actorRect.width / 2}px`;
      clone.style.top = `${actorRect.top + actorRect.height / 2}px`;
    }
    document.body.appendChild(clone);

    if (spriteDOM) {
      spriteDOM.classList.remove(
        'player-collect-anim-4',
        'player-collect-anim-5',
        'player-collect-basic',
        'player-collect-boost',
        'player-core-charged',
        'player-pulse-feedback',
        'player-speed-boost',
        'player-boosted',
        'shake'
      );
    }

    if (actorDOM) {
      actorDOM.classList.add('victory-actor', 'victory-source-hidden');
      const burst = document.createElement('div');
      burst.className = 'victory-burst';
      clone.appendChild(burst);
      burst.addEventListener('animationend', () => burst.remove(), { once: true });
    }

    setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate([50, 50, 100]);
      const overlay = document.getElementById('level-complete-overlay');
      overlay.classList.add('show');
      overlay.addEventListener('click', () => {
        location.reload();
      }, {once: true});
    }, 2050);
  },

  toggleGlobalAlert: function(isActive) {
    let overlay = document.getElementById('global-alert-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-alert-overlay';
      document.body.appendChild(overlay);
    }
    if (isActive) overlay.classList.add('active');
    else overlay.classList.remove('active');
  },

  corePulseFeedback: function(spriteDOM) {
    if ('vibrate' in navigator) navigator.vibrate([20, 35, 20]);
    if (!spriteDOM) return;
    spriteDOM.classList.remove('player-speed-boost', 'player-boosted', 'player-pulse-feedback');
    void spriteDOM.offsetWidth;
    spriteDOM.classList.add('player-pulse-feedback');
    setTimeout(() => {
      spriteDOM.classList.remove('player-pulse-feedback');
    }, 520);
  },

  triggerSpeedBoost: function(durationMs, spriteDOM) {
    if ('vibrate' in navigator) navigator.vibrate([30, 50, 30]);
    spriteDOM.classList.add('player-speed-boost', 'player-boosted');
    setTimeout(() => {
      spriteDOM.classList.remove('player-speed-boost', 'player-boosted');
    }, durationMs);
  },

  // v0.5.14: 玩家在還沒有 Core Pulse 時碰到出口，用震動+HUD閃爍提醒「出口還沒啟動」，不能單純衝到出口就過關
  exitLocked: function(spriteDOM, pulseHudEl) {
    if (spriteDOM && !spriteDOM.classList.contains('shake')) {
      spriteDOM.classList.add('shake');
      setTimeout(() => spriteDOM.classList.remove('shake'), 200);
    }
    if (pulseHudEl) {
      pulseHudEl.classList.add('glow');
      setTimeout(() => pulseHudEl.classList.remove('glow'), 220);
    }
    if ('vibrate' in navigator) navigator.vibrate([40, 40, 40, 40, 40]);
  }
};
