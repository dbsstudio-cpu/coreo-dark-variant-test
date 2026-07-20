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

  // v0.6.7：GPT 裁決 Core Pulse 改為 Supernova Burst——以拾取點為中心的局部鈦白/極光青爆發，
  // 取代舊版的黃色全地圖 overlay。單一元素、播完自動移除，效能成本固定。
  spawnSupernovaBurst: function(x, y) {
    const world = document.getElementById('world');
    if (!world) return;
    const burst = document.createElement('div');
    burst.className = 'supernova-burst-fx';
    if (world.classList.contains('stage-03')) {
      burst.style.background = 'radial-gradient(circle, rgba(230,255,241,.9) 0%, rgba(115,224,166,.66) 22%, rgba(32,201,114,.3) 44%, transparent 76%)';
    }
    burst.style.left = `${x}px`;
    burst.style.top = `${y}px`;
    world.appendChild(burst);
    burst.addEventListener('animationend', () => burst.remove(), { once: true });
  },

  // v0.6.9：矩陣線條回歸——Sean 指定找回 v0.5.19「迷宮接縫矩陣點亮」的線條感，改白金色，
  // 跟 Supernova Burst 疊加觸發，不取代它。只切換 #world 的 class，實際發光靠 css/tokens.css
  // 裡 .cell.path::after／.cell.wall::before 的 opacity transition 完成，不逐格寫入 box-shadow。
  pulseMatrixLines: function() {
    const world = document.getElementById('world');
    if (!world) return;
    world.classList.add('matrix-pulse');
    setTimeout(() => world.classList.remove('matrix-pulse'), 130);
  },

  collectCore: function(coreDOM, spriteDOM, type) {
    const isBoost = type === 5;
    // v0.8.3：Sean/GPT 最高優先覆蓋裁決，Stage02 的 Core Pulse 飛行粒子也不能是白金黃，
    // 這個粒子是 appendChild 到 document.body（不是 #world 底下），沒辦法用 CSS 後代選擇器
    // 靠 .stage-02 自動切色，直接在 JS 判斷目前是哪一關
    const world = document.getElementById('world');
    const isStage02 = world?.classList.contains('stage-02');
    const isStage03 = world?.classList.contains('stage-03');
    const boostColor = isStage03 ? '#20C972' : (isStage02 ? '#64D2FF' : 'var(--coreo-core-boost)');
    const uiCore = document.getElementById(isBoost ? 'ui-pulse-val' : 'ui-shard-val');
    const rect = coreDOM.getBoundingClientRect();
    const uiRect = uiCore.getBoundingClientRect();

    const particle = document.createElement('div');
    particle.style.position = 'fixed';
    particle.style.left = `${rect.left + rect.width / 2}px`;
    particle.style.top = `${rect.top + rect.height / 2}px`;
    particle.style.width = isBoost ? '14px' : '12px';
    particle.style.height = isBoost ? '14px' : '12px';
    particle.style.backgroundColor = isBoost ? boostColor : (isStage03 ? '#DDF8E9' : 'var(--coreo-core-basic)');
    particle.style.borderRadius = isBoost ? '4px' : '50%';
    particle.style.boxShadow = isBoost ? `0 0 15px ${boostColor}` : `0 0 15px ${isStage03 ? '#8AF0B8' : 'var(--coreo-core-basic-glow)'}`;
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
      // v0.8.3：Sean/GPT 最高優先覆蓋裁決，STAGE SECURED 底線在 Stage02 也不能帶黃色
      const worldClassList = document.getElementById('world')?.classList;
      overlay.classList.toggle('stage-02', worldClassList?.contains('stage-02'));
      overlay.classList.toggle('stage-03', worldClassList?.contains('stage-03'));
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
      const worldClassList = document.getElementById('world')?.classList;
      const glowClass = worldClassList?.contains('stage-03') ? 'glow-s3' : (worldClassList?.contains('stage-02') ? 'glow-s2' : 'glow');
      pulseHudEl.classList.add(glowClass);
      setTimeout(() => pulseHudEl.classList.remove(glowClass), 220);
    }
    if ('vibrate' in navigator) navigator.vibrate([40, 40, 40, 40, 40]);
  }
};
