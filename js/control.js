// js/control.js — COREO DARK v0.10.1
// One deliberate swipe emits one direction command. The player keeps moving after
// release; the next swipe changes direction and a tap stops movement.
const ControlLogic = {
  VERSION: 'v0.10.1',
  SWIPE_THRESHOLD: 18,
  DIAGONAL_FALLBACK_THRESHOLD: 26,
  AXIS_BIAS: 1.15,
  dx: 0,
  dy: 0,
  isActive: false,
  activePointerId: null,
  startPointerX: 0,
  startPointerY: 0,
  gestureIssued: false,
  acceptedDirection: null,
  commandId: 0,
  commandQueue: [],
  zoneElement: null,

  chooseDirection: function(dx, dy) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < this.SWIPE_THRESHOLD && ay < this.SWIPE_THRESHOLD) return null;
    if (ax >= ay * this.AXIS_BIAS) return { x: dx > 0 ? 1 : -1, y: 0 };
    if (ay >= ax * this.AXIS_BIAS) return { x: 0, y: dy > 0 ? 1 : -1 };
    if (Math.max(ax, ay) < this.DIAGONAL_FALLBACK_THRESHOLD) return null;
    return ax >= ay ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
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
    } else {
      this.acceptedDirection = null;
      this.dx = 0;
      this.dy = 0;
    }
    return command;
  },

  start: function(x, y, pointerId) {
    if (this.isActive) return;
    this.isActive = true;
    this.activePointerId = pointerId;
    this.startPointerX = x;
    this.startPointerY = y;
    this.gestureIssued = false;
  },

  move: function(x, y, now = performance.now()) {
    if (!this.isActive || this.gestureIssued) return null;
    const direction = this.chooseDirection(x - this.startPointerX, y - this.startPointerY);
    if (!direction) return null;
    this.gestureIssued = true;
    return this.emitCommand('direction', direction, 'discrete-swipe', now);
  },

  finish: function(source = 'pointerup', now = performance.now()) {
    if (!this.isActive) return null;
    const issued = this.gestureIssued;
    const cancelled = source === 'pointercancel' || source === 'touchcancel' || source === 'lostcapture';
    this.isActive = false;
    this.activePointerId = null;
    this.gestureIssued = false;
    if (issued && !cancelled) return null;
    return this.stop(source === 'pointerup' || source === 'touchend' ? 'tap-stop' : source, now);
  },

  stop: function(source = 'stop', now = performance.now()) {
    const hadInput = this.isActive || this.acceptedDirection || this.dx !== 0 || this.dy !== 0;
    this.isActive = false;
    this.activePointerId = null;
    this.gestureIssued = false;
    return hadInput ? this.emitCommand('stop', null, source, now) : null;
  },

  getCommandsAfter: function(lastConsumedId) {
    return this.commandQueue.filter((command) => command.id > lastConsumedId);
  },

  init: function() {
    this.zoneElement = document.getElementById('joystick-zone');
    if (!this.zoneElement) throw new Error('COREO swipe control zone not found');

    if (window.PointerEvent) {
      this.zoneElement.addEventListener('pointerdown', (event) => {
        if (this.isActive) return;
        event.preventDefault();
        try { this.zoneElement.setPointerCapture?.(event.pointerId); } catch (_) { /* Safari teardown race. */ }
        this.start(event.clientX, event.clientY, event.pointerId);
      }, { passive: false });
      this.zoneElement.addEventListener('pointermove', (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.move(event.clientX, event.clientY);
      }, { passive: false });
      const endPointer = (event, source) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.finish(source);
      };
      this.zoneElement.addEventListener('pointerup', (event) => endPointer(event, 'pointerup'), { passive: false });
      this.zoneElement.addEventListener('pointercancel', (event) => endPointer(event, 'pointercancel'), { passive: false });
      this.zoneElement.addEventListener('lostpointercapture', (event) => {
        if (event.pointerId === this.activePointerId) this.finish('lostcapture');
      });
      return;
    }

    const findTouch = (list, id) => Array.from(list || []).find((touch) => id === null || touch.identifier === id) || null;
    this.zoneElement.addEventListener('touchstart', (event) => {
      if (this.isActive) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
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
      this.finish('touchend');
    }, { passive: false });
    document.addEventListener('touchcancel', (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      this.finish('touchcancel');
    }, { passive: false });
  },

  getVector: function() {
    return { x: this.dx, y: this.dy };
  }
};
