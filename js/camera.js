// js/camera.js
const CameraLogic = {
  worldDOM: null,
  currentY: 0,
  targetY: 0,
  worldHeight: 0,
  viewportHeight: 0,

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
  },

  // 讓玩家穩定停在畫面下方約三分之一，保留前方視野。
  update: function(playerWorldY) {
    if (!this.worldDOM) return;

    const worldHeight = this.worldHeight || this.worldDOM.offsetHeight || 0;
    const viewportHeight = this.viewportHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    const anchorY = viewportHeight * 0.56;
    const unshiftedPlayerY = (viewportHeight * 0.5) - (worldHeight * 0.5) + playerWorldY;

    this.targetY = anchorY - unshiftedPlayerY;
    this.currentY += (this.targetY - this.currentY) * 0.16;

    const stableY = Math.round(this.currentY);
    this.worldDOM.style.transform = `rotateX(40deg) translate3d(0, ${stableY}px, -165px)`;
  }
};

