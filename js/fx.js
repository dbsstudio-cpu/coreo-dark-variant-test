// js/fx.js
const FX = {
  // 收集 Light Core：實體飛向 HUD，並依 type 觸發對應的內層 sprite 放大動畫
  collectCore: function(coreDOM, spriteDOM, type) {
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

    // 觸發主角內層 sprite 的收集放大動畫（Type 4 / Type 5 各自獨立動畫）
    if (spriteDOM) {
      const animClass = type === 5 ? 'player-collect-anim-5' : 'player-collect-anim-4';
      spriteDOM.classList.remove('player-collect-anim-4', 'player-collect-anim-5');
      void spriteDOM.offsetWidth; // 觸發 reflow 確保動畫重新播放
      spriteDOM.classList.add(animClass);
    }
  },

  // 撞牆震動（作用在角色內層 sprite）
  wallBump: function(spriteDOM) {
    if (spriteDOM.classList.contains('shake')) return;
    spriteDOM.classList.add('shake');
    if('vibrate' in navigator) navigator.vibrate(10);
    setTimeout(() => spriteDOM.classList.remove('shake'), 200);
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

  // 強化能量的速度與視覺增益（作用在角色內層 sprite）
  triggerSpeedBoost: function(durationMs, spriteDOM) {
    if('vibrate' in navigator) navigator.vibrate([30, 50, 30]);
    spriteDOM.classList.add('player-speed-boost');
    setTimeout(() => {
      spriteDOM.classList.remove('player-speed-boost');
    }, durationMs);
  }
};


