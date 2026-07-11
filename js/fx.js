// js/fx.js
const FX = {
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
  levelComplete: function(spriteDOM, actorDOM) {
    if ('vibrate' in navigator) navigator.vibrate([40, 30, 40, 30, 120]);

    if (spriteDOM) {
      spriteDOM.classList.add('player-victory-zoom');
    }

    if (actorDOM) {
      const burst = document.createElement('div');
      burst.className = 'victory-burst';
      actorDOM.appendChild(burst);
      burst.addEventListener('animationend', () => burst.remove(), { once: true });
    }

    setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate([50, 50, 100]);
      const overlay = document.getElementById('level-complete-overlay');
      overlay.classList.add('show');
      overlay.addEventListener('click', () => {
        location.reload();
      }, {once: true});
    }, 2200);
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
