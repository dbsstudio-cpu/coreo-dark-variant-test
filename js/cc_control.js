// js/cc_control.js — CC Control Lab R1
// 「跟隨錨點」短撥輸入層：
// 1. 錨點會跟著手指走（超出 FOLLOW 半徑就被拖動），所以急轉彎時不需要把手指
//    跨回原始按壓點——這是 v0.9.6 被 Sean 否決的核心原因（換方向要跨回原中心）。
// 2. 只輸出上下左右四方向意圖，不輸出類比向量；優勢軸判定＋遲滯比，
//    手指微抖不會誤切換軸向，明確的短撥（7~10px）立刻換方向。
// 3. 觸控區鎖在畫面底部（由頁面決定高度），手指不需要跟著角色往上跑，
//    從物理上避免拇指滑進畫面中段遮住主角與路線。
const CCControl = {
  isActive: false,
  pointerId: null,
  anchorX: 0,
  anchorY: 0,
  intentX: 0,
  intentY: 0,

  DEAD: 9,            // 中心死區（px）：小於此距離不判定方向
  FOLLOW: 30,         // 跟隨半徑（px）：手指超出此距離就拖動錨點，短撥即可反向
  AXIS_SWITCH: 1.12,  // 換軸遲滯比：新軸分量要明顯大於現行軸才切換，過濾斜向抖動

  init: function(zoneEl) {
    const down = (x, y, id) => {
      if (this.isActive) return;
      this.isActive = true;
      this.pointerId = id;
      this.anchorX = x;
      this.anchorY = y;
      this.intentX = 0;
      this.intentY = 0;
    };

    const move = (x, y) => {
      if (!this.isActive) return;
      let dx = x - this.anchorX;
      let dy = y - this.anchorY;
      const dist = Math.hypot(dx, dy);

      // 錨點跟隨：手指拉超過 FOLLOW 就把錨點往手指方向拖，
      // delta 永遠反映「最近的手指動向」而不是「距離最初按壓點的位移」
      if (dist > this.FOLLOW) {
        const pull = (dist - this.FOLLOW) / dist;
        this.anchorX += dx * pull;
        this.anchorY += dy * pull;
        dx = x - this.anchorX;
        dy = y - this.anchorY;
      }

      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax < this.DEAD && ay < this.DEAD) return; // 死區內：保留現行意圖不清空

      const currentAxis = this.intentX !== 0 ? 'x' : (this.intentY !== 0 ? 'y' : null);
      let useAxis;
      if (!currentAxis) {
        useAxis = ax >= ay ? 'x' : 'y';
      } else if (currentAxis === 'x') {
        useAxis = (ay > ax * this.AXIS_SWITCH || ax < this.DEAD) ? 'y' : 'x';
      } else {
        useAxis = (ax > ay * this.AXIS_SWITCH || ay < this.DEAD) ? 'x' : 'y';
      }

      if (useAxis === 'x' && ax >= this.DEAD) {
        this.intentX = dx > 0 ? 1 : -1;
        this.intentY = 0;
      } else if (useAxis === 'y' && ay >= this.DEAD) {
        this.intentX = 0;
        this.intentY = dy > 0 ? 1 : -1;
      }
    };

    const up = () => {
      this.isActive = false;
      this.pointerId = null;
      this.intentX = 0;
      this.intentY = 0;
    };

    if (window.PointerEvent) {
      zoneEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        zoneEl.setPointerCapture?.(e.pointerId);
        down(e.clientX, e.clientY, e.pointerId);
      });
      zoneEl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        move(e.clientX, e.clientY);
      });
      const end = (e) => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        up();
      };
      zoneEl.addEventListener('pointerup', end);
      zoneEl.addEventListener('pointercancel', end);
      zoneEl.addEventListener('lostpointercapture', () => up());
      return;
    }

    // 舊瀏覽器 touch 備援
    const getTouch = (e) => (e.touches && e.touches.length ? e.touches[0] : null);
    zoneEl.addEventListener('touchstart', (e) => {
      const t = getTouch(e);
      if (!t) return;
      e.preventDefault();
      down(t.clientX, t.clientY, null);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!this.isActive) return;
      const t = getTouch(e);
      if (!t) return;
      e.preventDefault();
      move(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
      if (!this.isActive) return;
      e.preventDefault();
      up();
    }, { passive: false });
    document.addEventListener('touchcancel', () => up(), { passive: false });
  },

  // 回傳目前四方向意圖；手指按著但還在死區時回傳 null（外層自行決定是否沿用現行方向）
  getIntent: function() {
    if (!this.isActive) return null;
    if (this.intentX === 0 && this.intentY === 0) return null;
    return { x: this.intentX, y: this.intentY };
  }
};
