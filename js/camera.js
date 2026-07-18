// js/camera.js
const CameraLogic = {
  worldDOM: null,
  currentY: 0,
  targetY: 0,
  worldHeight: 0,
  viewportHeight: 0,
  viewportWidth: 0,
  worldScale: 1,
  exitDirection: 'up',

  init: function() {
    this.worldDOM = document.getElementById('world');
    this.currentY = 0;
    this.targetY = 0;
    this.refreshMetrics();
    window.addEventListener('resize', () => this.refreshMetrics());
  },

  refreshMetrics: function() {
    this.worldHeight = this.worldDOM ? this.worldDOM.offsetHeight || 0 : 0;
    this.viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    this.viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const worldWidth = this.worldDOM ? this.worldDOM.offsetWidth || 0 : 0;
    this.worldScale = worldWidth > 0 ? Math.min(1, Math.max(0.78, (this.viewportWidth - 16) / worldWidth)) : 1;
  },

  // 關卡出口方向決定前方視野；v0.9.6 同時保留畫面底部的實體拇指安全區。
  setDirection: function(direction) {
    this.exitDirection = direction === 'down' ? 'down' : 'up';
  },

  // 讓玩家穩定停在畫面約三分之一處，保留前方視野（方向依 exitDirection 而定）。
  update: function(playerWorldY) {
    if (!this.worldDOM) return;

    const worldHeight = this.worldHeight || this.worldDOM.offsetHeight || 0;
    const viewportHeight = this.viewportHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    const scale = this.worldScale || 1;
    const anchorY = viewportHeight * (this.exitDirection === 'down' ? 0.42 : 0.50);
    const unshiftedPlayerY = (viewportHeight * 0.5) - (worldHeight * scale * 0.5) + (playerWorldY * scale);

    this.targetY = anchorY - unshiftedPlayerY;
    this.currentY += (this.targetY - this.currentY) * 0.16;

    const stableY = Math.round(this.currentY);
    this.worldDOM.style.transform = `rotateX(40deg) translate3d(0, ${stableY}px, -165px) scale(${scale})`;
  }
};

