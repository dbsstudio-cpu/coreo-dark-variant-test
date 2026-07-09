// js/fx.js
const FX = {
  // 收集 Light Core：實體飛向 HUD
  collectCore: function(coreDOM) {
    const uiCore = document.getElementById('ui-core-val');

    // 取得 3D 空間中物件的 2D 螢幕座標
    const rect = coreDOM.getBoundingClientRect();
    const uiRect = uiCore.getBoundingClientRect();

    // 創建飛行粒子 (在 2D Overlay 層)
    const particle = document.createElement('div');
    particle.style.position = 'fixed';
    particle.style.left = `${rect.left + rect.width/2}px`;
    particle.style.top = `${rect.top + rect.height/2}px`;
    particle.style.width = '12px';
    particle.style.height = '12px';
    particle.style.backgroundColor = 'var(--coreo-credit-hot)';
    particle.style.borderRadius = '50%';
    particle.style.boxShadow = '0 0 15px rgba(240, 216, 154, 0.85)';
    particle.style.zIndex = '9999';
    particle.style.pointerEvents = 'none';
    document.body.appendChild(particle);

    coreDOM.remove(); // 移除地圖上的核心

    // Web Animations API (原生支援度極高)
    const animation = particle.animate([
      { transform: 'translate(-50%, -50%) scale(1)' },
      { transform: `translate(${uiRect.left - rect.left}px, ${uiRect.top - rect.top}px) scale(0.5)` }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)' // 快速吸入感
    });

    animation.onfinish = () => {
      particle.remove();
      // HUD 數字跳動
      const current = parseInt(uiCore.textContent);
      uiCore.textContent = (current + 1).toString().padStart(2, '0');
      uiCore.classList.add('glow');
      setTimeout(() => uiCore.classList.remove('glow'), 200);

      // Haptics
      if('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
    };

    // 觸發主角放大搖擺動畫
    const playerDOM = document.getElementById('player');
    if (playerDOM) {
      // 移除再重加，確保連續吃到能量時動畫能重置觸發 (Trigger Reflow)
      playerDOM.classList.remove('player-collect-anim');
      void playerDOM.offsetWidth;
      playerDOM.classList.add('player-collect-anim');
      setTimeout(() => playerDOM.classList.remove('player-collect-anim'), 1050);
    }
  },

  // 撞牆震動
  wallBump: function(playerDOM) {
    if (playerDOM.classList.contains('shake')) return;
    playerDOM.classList.add('shake');
    if('vibrate' in navigator) navigator.vibrate(10);
    setTimeout(() => playerDOM.classList.remove('shake'), 200);
  },

  // 過關收束動畫 (取代 alert)
  levelComplete: function() {
    if('vibrate' in navigator) navigator.vibrate([50, 50, 100]);
    const overlay = document.getElementById('level-complete-overlay');
    overlay.classList.add('show');

    // 點擊畫面重新開始
    overlay.addEventListener('click', () => {
      location.reload();
    }, {once: true});
  },

  // 全域壓力警戒光 (淡紅色 Overlay)
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

  // 強化能量的速度與視覺增益
  triggerSpeedBoost: function(durationMs, playerDOM) {
    if('vibrate' in navigator) navigator.vibrate([30, 50, 30]);
    playerDOM.classList.add('player-speed-boost');
    setTimeout(() => {
      playerDOM.classList.remove('player-speed-boost');
    }, durationMs);
  }
};


