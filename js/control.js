// js/control.js
// v0.9.6：拇指安全區＋迷宮四方向意圖控制。
const ControlLogic = {
  dx: 0,
  dy: 0,
  direction: null,
  isActive: false,
  activePointerId: null,
  baseX: 0,
  baseY: 0,
  baseElement: null,
  knobElement: null,
  zoneElement: null,
  maxRadius: 42,
  deadZone: 8,
  switchBias: 1.18,
  edgeSafeInset: 42,

  refreshSafeInset: function() {
    this.edgeSafeInset = Math.min(58, Math.max(36, Math.round(window.innerWidth * 0.065)));
    document.documentElement.style.setProperty('--coreo-gesture-safe-inset', `${this.edgeSafeInset}px`);
    if (!this.isActive) requestAnimationFrame(() => this.placeIdleBase());
  },

  isEdgeGestureStart: function(x) {
    return x <= this.edgeSafeInset || x >= window.innerWidth - this.edgeSafeInset;
  },

  placeIdleBase: function() {
    if (!this.zoneElement || !this.baseElement) return;
    const rect = this.zoneElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.baseElement.style.left = `${rect.width * 0.5}px`;
    this.baseElement.style.top = `${rect.height * 0.52}px`;
    this.baseElement.classList.remove('active');
    this.baseElement.classList.add('idle');
  },

  stop: function() {
    this.isActive = false;
    this.activePointerId = null;
    this.dx = 0;
    this.dy = 0;
    this.direction = null;
    if (this.knobElement) this.knobElement.style.transform = 'translate(-50%, -50%)';
    this.placeIdleBase();
  },

  init: function() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    this.zoneElement = zone;
    this.baseElement = base;
    this.knobElement = knob;
    this.refreshSafeInset();
    window.addEventListener('resize', () => this.refreshSafeInset());

    const setBase = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      const visualRadius = Math.min(58, Math.max(48, rect.width * 0.16));
      const localX = Math.min(rect.width - visualRadius, Math.max(visualRadius, clientX - rect.left));
      const localY = Math.min(rect.height - visualRadius, Math.max(visualRadius, clientY - rect.top));

      // baseX/baseY 保留 viewport 座標供 pointermove 計算；DOM 位置則必須使用 zone 相對座標。
      this.baseX = rect.left + localX;
      this.baseY = rect.top + localY;
      this.dx = 0;
      this.dy = 0;
      this.direction = null;
      base.style.left = `${localX}px`;
      base.style.top = `${localY}px`;
      base.classList.remove('idle');
      base.classList.add('active');
      knob.style.transform = 'translate(-50%, -50%)';
    };

    const updateDirection = (deltaX, deltaY) => {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < this.deadZone) {
        this.dx = 0;
        this.dy = 0;
        this.direction = null;
        return;
      }

      let nextDirection = this.direction;
      const horizontalSign = deltaX < 0 ? 'left' : 'right';
      const verticalSign = deltaY < 0 ? 'up' : 'down';

      if (!nextDirection) {
        nextDirection = absX > absY ? horizontalSign : verticalSign;
      } else if (nextDirection === 'left' || nextDirection === 'right') {
        nextDirection = absY > absX * this.switchBias ? verticalSign : horizontalSign;
      } else {
        nextDirection = absX > absY * this.switchBias ? horizontalSign : verticalSign;
      }

      this.direction = nextDirection;
      this.dx = nextDirection === 'left' ? -1 : nextDirection === 'right' ? 1 : 0;
      this.dy = nextDirection === 'up' ? -1 : nextDirection === 'down' ? 1 : 0;
    };

    const updateVector = (clientX, clientY) => {
      const rawX = clientX - this.baseX;
      const rawY = clientY - this.baseY;
      const distance = Math.hypot(rawX, rawY);
      let visualX = rawX;
      let visualY = rawY;
      if (distance > this.maxRadius) {
        const ratio = this.maxRadius / distance;
        visualX *= ratio;
        visualY *= ratio;
      }
      knob.style.transform = `translate(calc(-50% + ${visualX}px), calc(-50% + ${visualY}px))`;
      updateDirection(rawX, rawY);
    };

    const stop = () => this.stop();

    if (window.PointerEvent) {
      zone.addEventListener('pointerdown', (event) => {
        if (this.isActive) return;
        if (this.isEdgeGestureStart(event.clientX)) {
          this.stop();
          return;
        }
        event.preventDefault();
        this.isActive = true;
        this.activePointerId = event.pointerId;
        zone.setPointerCapture?.(event.pointerId);
        setBase(event.clientX, event.clientY);
      });

      zone.addEventListener('pointermove', (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        updateVector(event.clientX, event.clientY);
      });

      const endPointer = (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        stop();
      };
      zone.addEventListener('pointerup', endPointer);
      zone.addEventListener('pointercancel', endPointer);
      zone.addEventListener('lostpointercapture', () => stop());
      return;
    }

    const getTouch = (event) => event.touches && event.touches.length ? event.touches[0] : null;
    zone.addEventListener('touchstart', (event) => {
      if (this.isActive) return;
      const touch = getTouch(event);
      if (!touch) return;
      if (this.isEdgeGestureStart(touch.clientX)) {
        this.stop();
        return;
      }
      event.preventDefault();
      this.isActive = true;
      setBase(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener('touchmove', (event) => {
      if (!this.isActive) return;
      const touch = getTouch(event);
      if (!touch) return;
      event.preventDefault();
      updateVector(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener('touchend', (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      stop();
    }, { passive: false });

    document.addEventListener('touchcancel', (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      stop();
    }, { passive: false });
  },

  getDirection: function() {
    return this.direction;
  },

  getVector: function() {
    return { x: this.dx, y: this.dy };
  }
};
