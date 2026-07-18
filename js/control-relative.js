// js/control-relative.js
// CONTROL LAB R2：底部隱形相對短滑；每次接受方向後立即以當下拇指位置重新定錨。
const ControlLogic = {
  direction: null,
  commandId: 0,
  isActive: false,
  activePointerId: null,
  anchorX: 0,
  anchorY: 0,
  gestureThreshold: 13,
  edgeSafeInset: 36,

  refreshSafeInset: function() {
    this.edgeSafeInset = Math.min(52, Math.max(32, Math.round(window.innerWidth * 0.06)));
    document.documentElement.style.setProperty('--coreo-gesture-safe-inset', `${this.edgeSafeInset}px`);
  },

  isEdgeGestureStart: function(x) {
    return x <= this.edgeSafeInset || x >= window.innerWidth - this.edgeSafeInset;
  },

  begin: function(clientX, clientY, pointerId = null) {
    this.isActive = true;
    this.activePointerId = pointerId;
    this.anchorX = clientX;
    this.anchorY = clientY;
    this.direction = null;
  },

  update: function(clientX, clientY) {
    const deltaX = clientX - this.anchorX;
    const deltaY = clientY - this.anchorY;
    if (Math.hypot(deltaX, deltaY) < this.gestureThreshold) return;

    this.direction = Math.abs(deltaX) > Math.abs(deltaY)
      ? (deltaX < 0 ? 'left' : 'right')
      : (deltaY < 0 ? 'up' : 'down');
    this.commandId += 1;

    // 接受指令後立即重新定錨；下一次轉向只需再短滑，不必跨回最初圓心。
    this.anchorX = clientX;
    this.anchorY = clientY;
  },

  stop: function() {
    this.isActive = false;
    this.activePointerId = null;
    this.direction = null;
  },

  init: function() {
    const zone = document.getElementById('joystick-zone');
    this.refreshSafeInset();
    window.addEventListener('resize', () => this.refreshSafeInset());

    if (window.PointerEvent) {
      zone.addEventListener('pointerdown', (event) => {
        if (this.isActive || this.isEdgeGestureStart(event.clientX)) return;
        event.preventDefault();
        this.begin(event.clientX, event.clientY, event.pointerId);
        zone.setPointerCapture?.(event.pointerId);
      });

      zone.addEventListener('pointermove', (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.update(event.clientX, event.clientY);
      });

      const endPointer = (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.stop();
      };
      zone.addEventListener('pointerup', endPointer);
      zone.addEventListener('pointercancel', endPointer);
      zone.addEventListener('lostpointercapture', () => this.stop());
      return;
    }

    const getTouch = (event) => event.touches && event.touches.length ? event.touches[0] : null;
    zone.addEventListener('touchstart', (event) => {
      if (this.isActive) return;
      const touch = getTouch(event);
      if (!touch || this.isEdgeGestureStart(touch.clientX)) return;
      event.preventDefault();
      this.begin(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener('touchmove', (event) => {
      if (!this.isActive) return;
      const touch = getTouch(event);
      if (!touch) return;
      event.preventDefault();
      this.update(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener('touchend', (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      this.stop();
    }, { passive: false });

    document.addEventListener('touchcancel', (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      this.stop();
    }, { passive: false });
  },

  isPressed: function() {
    return this.isActive;
  },

  getDirection: function() {
    return this.direction;
  },

  getCommandId: function() {
    return this.commandId;
  },

  // 保留相容介面，測試版實際移動由 main-control-lab.js 的方向狀態機處理。
  getVector: function() {
    return {
      x: this.direction === 'left' ? -1 : this.direction === 'right' ? 1 : 0,
      y: this.direction === 'up' ? -1 : this.direction === 'down' ? 1 : 0
    };
  }
};
