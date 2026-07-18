// js/control.js — COREO DARK v0.9.7
// 最近手指增量 -> 一次性四方向命令；不再以按下中心或跟隨錨點判斷反向。
const ControlLogic = {
  VERSION: 'v0.9.7',
  dx: 0,
  dy: 0,
  isActive: false,
  activePointerId: null,
  lastPointerX: 0,
  lastPointerY: 0,
  lastPointerTime: 0,
  accumulatedDX: 0,
  accumulatedDY: 0,
  acceptedDirection: null,
  commandId: 0,
  commandQueue: [],
  baseElement: null,
  knobElement: null,
  edgeSafeInset: 48,
  REVERSE_THRESHOLD: 5,
  TURN_THRESHOLD: 7,
  AXIS_BIAS: 1.06,
  KNOB_OFFSET: 22,

  refreshSafeInset: function() {
    this.edgeSafeInset = Math.min(64, Math.max(42, Math.round(window.innerWidth * 0.075)));
    document.documentElement.style.setProperty('--coreo-gesture-safe-inset', `${this.edgeSafeInset}px`);
  },

  clampControlX: function(x) {
    return Math.min(window.innerWidth - this.edgeSafeInset, Math.max(this.edgeSafeInset, x));
  },

  isEdgeGestureStart: function(x) {
    return x <= this.edgeSafeInset || x >= window.innerWidth - this.edgeSafeInset;
  },

  sameDirection: function(a, b) {
    return !!(a && b && a.x === b.x && a.y === b.y);
  },

  resetAccumulation: function() {
    this.accumulatedDX = 0;
    this.accumulatedDY = 0;
  },

  updateVisual: function(direction) {
    if (!this.knobElement) return;
    const x = direction ? direction.x * this.KNOB_OFFSET : 0;
    const y = direction ? direction.y * this.KNOB_OFFSET : 0;
    this.knobElement.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  },

  emitCommand: function(type, direction, source, now = performance.now()) {
    this.commandId += 1;
    const command = {
      id: this.commandId,
      type,
      direction: direction ? { x: direction.x, y: direction.y } : null,
      source,
      timestamp: now
    };
    this.commandQueue.push(command);
    if (this.commandQueue.length > 64) this.commandQueue.shift();
    if (type === 'direction') {
      this.acceptedDirection = { x: direction.x, y: direction.y };
      this.dx = direction.x;
      this.dy = direction.y;
      this.updateVisual(direction);
    } else {
      this.acceptedDirection = null;
      this.dx = 0;
      this.dy = 0;
      this.updateVisual(null);
    }
    return command;
  },

  chooseDirection: function() {
    const dx = this.accumulatedDX;
    const dy = this.accumulatedDY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const current = this.acceptedDirection;

    if (current && current.x !== 0 && dx * current.x < 0 && ax >= this.REVERSE_THRESHOLD && ax >= ay * 0.85) {
      return { x: dx > 0 ? 1 : -1, y: 0 };
    }
    if (current && current.y !== 0 && dy * current.y < 0 && ay >= this.REVERSE_THRESHOLD && ay >= ax * 0.85) {
      return { x: 0, y: dy > 0 ? 1 : -1 };
    }

    if (!current) {
      if (ax >= this.TURN_THRESHOLD || ay >= this.TURN_THRESHOLD) {
        return ax >= ay ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
      }
      return null;
    }

    if (current.x !== 0 && ay >= this.TURN_THRESHOLD && ay >= ax * this.AXIS_BIAS) {
      return { x: 0, y: dy > 0 ? 1 : -1 };
    }
    if (current.y !== 0 && ax >= this.TURN_THRESHOLD && ax >= ay * this.AXIS_BIAS) {
      return { x: dx > 0 ? 1 : -1, y: 0 };
    }
    if (current.x !== 0 && ax >= this.TURN_THRESHOLD && ax >= ay) return { x: dx > 0 ? 1 : -1, y: 0 };
    if (current.y !== 0 && ay >= this.TURN_THRESHOLD && ay >= ax) return { x: 0, y: dy > 0 ? 1 : -1 };
    return null;
  },

  start: function(x, y, pointerId, now = performance.now()) {
    if (this.isActive) return;
    this.isActive = true;
    this.activePointerId = pointerId;
    this.lastPointerX = x;
    this.lastPointerY = y;
    this.lastPointerTime = now;
    this.resetAccumulation();
    if (this.baseElement) {
      this.baseElement.style.left = `${this.clampControlX(x)}px`;
      this.baseElement.style.top = `${y}px`;
      this.baseElement.classList.add('active');
    }
    this.updateVisual(null);
  },

  move: function(x, y, now = performance.now()) {
    if (!this.isActive) return null;
    const dx = x - this.lastPointerX;
    const dy = y - this.lastPointerY;
    this.lastPointerX = x;
    this.lastPointerY = y;
    this.lastPointerTime = now;
    if (dx === 0 && dy === 0) return null;

    if (this.accumulatedDX !== 0 && dx !== 0 && Math.sign(dx) !== Math.sign(this.accumulatedDX)) this.accumulatedDX = 0;
    if (this.accumulatedDY !== 0 && dy !== 0 && Math.sign(dy) !== Math.sign(this.accumulatedDY)) this.accumulatedDY = 0;
    this.accumulatedDX += dx;
    this.accumulatedDY += dy;

    const direction = this.chooseDirection();
    if (!direction) return null;
    const changed = !this.sameDirection(direction, this.acceptedDirection);
    this.resetAccumulation();
    return changed ? this.emitCommand('direction', direction, 'pointer-delta', now) : null;
  },

  stop: function(source = 'stop', now = performance.now()) {
    const hadInput = this.isActive || this.acceptedDirection || this.dx !== 0 || this.dy !== 0;
    this.isActive = false;
    this.activePointerId = null;
    this.resetAccumulation();
    if (this.baseElement) this.baseElement.classList.remove('active');
    return hadInput ? this.emitCommand('stop', null, source, now) : null;
  },

  getCommandsAfter: function(lastConsumedId) {
    return this.commandQueue.filter((command) => command.id > lastConsumedId);
  },

  init: function() {
    const zone = document.getElementById('joystick-zone');
    this.baseElement = document.getElementById('joystick-base');
    this.knobElement = document.getElementById('joystick-knob');
    if (!zone) throw new Error('COREO control zone not found');
    this.refreshSafeInset();
    window.addEventListener('resize', () => this.refreshSafeInset());

    if (window.PointerEvent) {
      zone.addEventListener('pointerdown', (event) => {
        if (this.isActive || this.isEdgeGestureStart(event.clientX)) return;
        event.preventDefault();
        try { zone.setPointerCapture?.(event.pointerId); } catch (_) { /* Safari teardown race. */ }
        this.start(event.clientX, event.clientY, event.pointerId);
      }, { passive: false });
      zone.addEventListener('pointermove', (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.move(event.clientX, event.clientY);
      }, { passive: false });
      const endPointer = (event, source) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.stop(source);
      };
      zone.addEventListener('pointerup', (event) => endPointer(event, 'pointerup'), { passive: false });
      zone.addEventListener('pointercancel', (event) => endPointer(event, 'pointercancel'), { passive: false });
      zone.addEventListener('lostpointercapture', (event) => {
        if (event.pointerId === this.activePointerId) this.stop('lostcapture');
      });
      return;
    }

    const findTouch = (list, id) => Array.from(list || []).find((touch) => id === null || touch.identifier === id) || null;
    zone.addEventListener('touchstart', (event) => {
      if (this.isActive) return;
      const touch = event.changedTouches && event.changedTouches[0];
      if (!touch || this.isEdgeGestureStart(touch.clientX)) return;
      event.preventDefault();
      this.start(touch.clientX, touch.clientY, touch.identifier);
    }, { passive: false });
    document.addEventListener('touchmove', (event) => {
      if (!this.isActive) return;
      const touch = findTouch(event.touches, this.activePointerId);
      if (!touch) return;
      event.preventDefault();
      this.move(touch.clientX, touch.clientY);
    }, { passive: false });
    document.addEventListener('touchend', (event) => {
      if (!this.isActive || !findTouch(event.changedTouches, this.activePointerId)) return;
      event.preventDefault();
      this.stop('touchend');
    }, { passive: false });
    document.addEventListener('touchcancel', (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      this.stop('touchcancel');
    }, { passive: false });
  },

  getVector: function() {
    return { x: this.dx, y: this.dy };
  }
};
