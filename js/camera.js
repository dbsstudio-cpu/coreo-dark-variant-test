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

  // v0.7.1：關卡出口方向決定「前方視野」該留在螢幕的哪一側，
  // exitDirection:'up'（Stage01，玩家往上走）沿用原本 0.56（前方在上，畫面上半留多一點）；
  // exitDirection:'down'（Stage02，玩家往下走）鏡射成 0.44（前方在下，畫面下半留多一點），
  // 之前這個值是寫死的，只對 Stage01 的方向合理，Stage02 出口反過來後沒有跟著改，
  // 造成畫面上半大片空白、實際可玩區域被壓縮到下半一小塊。
  setDirection: function(direction) {
    this.exitDirection = direction === 'down' ? 'down' : 'up';
  },

  // 讓玩家穩定停在畫面約三分之一處，保留前方視野（方向依 exitDirection 而定）。
  update: function(playerWorldY, frameDeltaMs = 16.66) {
    if (!this.worldDOM) return;

    const worldHeight = this.worldHeight || this.worldDOM.offsetHeight || 0;
    const viewportHeight = this.viewportHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    const scale = this.worldScale || 1;
    const anchorY = viewportHeight * (this.exitDirection === 'down' ? 0.44 : 0.56);
    const unshiftedPlayerY = (viewportHeight * 0.5) - (worldHeight * scale * 0.5) + (playerWorldY * scale);

    this.targetY = anchorY - unshiftedPlayerY;

    // v0.10.5.1：把原本「每幀固定 0.16」換成等效的時間式平滑。
    // iOS 偶發掉幀時，相機不會因幀距改變而忽快忽慢；60Hz 的手感維持不變。
    const safeDelta = Math.min(Math.max(Number(frameDeltaMs) || 16.66, 0), 34);
    const smoothing = 1 - Math.pow(1 - 0.16, safeDelta / 16.66);
    this.currentY += (this.targetY - this.currentY) * smoothing;

    // 保留 iPhone Retina 的實體像素精度，避免整數 CSS px 造成可見的階梯跳動。
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const stableY = Math.round(this.currentY * pixelRatio) / pixelRatio;
    this.worldDOM.style.transform = `rotateX(40deg) translate3d(0, ${stableY}px, -165px) scale(${scale})`;
  }
};

