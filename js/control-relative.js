// CONTROL LAB R3: invisible relative-swipe steering tuned for mobile corners.
const ControlLogic = {
  direction: null,
  commandId: 0,
  isActive: false,
  activePointerId: null,
  anchorX: 0,
  anchorY: 0,
  gestureThreshold: 7,
  perpendicularBias: 0.58,
  edgeSafeInset: 36,

  refreshSafeInset: function() {
    this.edgeSafeInset = Math.min(48, Math.max(28, Math.round(window.innerWidth * 0.055)));
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

  chooseDirection: function(deltaX, deltaY) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const wasVertical = this.direction === 'up' || this.direction === 'down';
    const wasHorizontal = this.direction === 'left' || this.direction === 'right';

    // A short perpendicular swipe wins over the previous axis. This makes a
    // pocket exit followed by an immediate left/right turn register reliably.
    if (wasVertical && absX >= this.gestureThreshold && absX >= absY * this.perpendicularBias) {
      return deltaX < 0 ? 'left' : 'right';
    }
    if (wasHorizontal && absY >= this.gestureThreshold && absY >= absX * this.perpendicularBias) {
      return deltaY < 0 ? 'up' : 'down';
    }
    return absX > absY
      ? (deltaX < 0 ? 'left' : 'right')
      : (deltaY < 0 ? 'up' : 'down');
  },

  update: function(clientX, clientY) {
    const deltaX = clientX - this.anchorX;
    const deltaY = clientY - this.anchorY;
    if (Math.hypot(deltaX, deltaY) < this.gestureThreshold) return;

    this.direction = this.chooseDirection(deltaX, deltaY);
    this.commandId += 1;

    // Every accepted short swipe becomes the origin of the next command.
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

    const endTouch = (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      this.stop();
    };
    document.addEventListener('touchend', endTouch, { passive: false });
    document.addEventListener('touchcancel', endTouch, { passive: false });
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

  getVector: function() {
    return {
      x: this.direction === 'left' ? -1 : this.direction === 'right' ? 1 : 0,
      y: this.direction === 'up' ? -1 : this.direction === 'down' ? 1 : 0
    };
  }
};
