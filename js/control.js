// js/control.js — COREO DARK v0.10.0
// Fixed digital four-direction input: press to move, slide onto another key to turn,
// release to stop. No swipe distance, angle, velocity or floating anchor is involved.
const ControlLogic = {
  VERSION: 'v0.10.0',
  dx: 0,
  dy: 0,
  isActive: false,
  activePointerId: null,
  acceptedDirection: null,
  commandId: 0,
  commandQueue: [],
  zoneElement: null,
  padElement: null,
  keyElements: [],

  sameDirection: function(a, b) {
    return !!(a && b && a.x === b.x && a.y === b.y);
  },

  directionFromElement: function(element) {
    const key = element?.closest?.('[data-dpad-direction]');
    if (!key || !this.padElement?.contains(key)) return null;
    return {
      x: Number(key.dataset.dx),
      y: Number(key.dataset.dy),
      name: key.dataset.dpadDirection
    };
  },

  directionAtPoint: function(x, y) {
    return this.directionFromElement(document.elementFromPoint(x, y));
  },

  updateVisual: function(direction) {
    for (const key of this.keyElements) {
      const isActive = !!direction &&
        Number(key.dataset.dx) === direction.x &&
        Number(key.dataset.dy) === direction.y;
      key.classList.toggle('active', isActive);
      key.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
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

  startDirection: function(direction, pointerId, now = performance.now()) {
    if (this.isActive || !direction) return null;
    this.isActive = true;
    this.activePointerId = pointerId;
    this.padElement?.classList.add('engaged');
    return this.emitCommand('direction', direction, 'digital-dpad-down', now);
  },

  changeDirection: function(direction, now = performance.now()) {
    if (!this.isActive || !direction || this.sameDirection(direction, this.acceptedDirection)) return null;
    return this.emitCommand('direction', direction, 'digital-dpad-slide', now);
  },

  stop: function(source = 'stop', now = performance.now()) {
    const hadInput = this.isActive || this.acceptedDirection || this.dx !== 0 || this.dy !== 0;
    this.isActive = false;
    this.activePointerId = null;
    this.padElement?.classList.remove('engaged');
    return hadInput ? this.emitCommand('stop', null, source, now) : null;
  },

  getCommandsAfter: function(lastConsumedId) {
    return this.commandQueue.filter((command) => command.id > lastConsumedId);
  },

  init: function() {
    this.zoneElement = document.getElementById('joystick-zone');
    this.padElement = document.getElementById('digital-dpad');
    this.keyElements = Array.from(document.querySelectorAll('[data-dpad-direction]'));
    if (!this.zoneElement || !this.padElement || this.keyElements.length !== 4) {
      throw new Error('COREO digital direction pad not found');
    }

    if (window.PointerEvent) {
      this.padElement.addEventListener('pointerdown', (event) => {
        const direction = this.directionFromElement(event.target);
        if (this.isActive || !direction) return;
        event.preventDefault();
        try { this.padElement.setPointerCapture?.(event.pointerId); } catch (_) { /* Safari teardown race. */ }
        this.startDirection(direction, event.pointerId);
      }, { passive: false });

      this.padElement.addEventListener('pointermove', (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        const direction = this.directionAtPoint(event.clientX, event.clientY);
        if (direction) this.changeDirection(direction);
      }, { passive: false });

      const endPointer = (event, source) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.stop(source);
      };
      this.padElement.addEventListener('pointerup', (event) => endPointer(event, 'pointerup'), { passive: false });
      this.padElement.addEventListener('pointercancel', (event) => endPointer(event, 'pointercancel'), { passive: false });
      this.padElement.addEventListener('lostpointercapture', (event) => {
        if (event.pointerId === this.activePointerId) this.stop('lostcapture');
      });
      return;
    }

    const findTouch = (list, id) => Array.from(list || []).find((touch) => id === null || touch.identifier === id) || null;
    this.padElement.addEventListener('touchstart', (event) => {
      if (this.isActive) return;
      const touch = event.changedTouches?.[0];
      const direction = touch ? this.directionAtPoint(touch.clientX, touch.clientY) : null;
      if (!touch || !direction) return;
      event.preventDefault();
      this.startDirection(direction, touch.identifier);
    }, { passive: false });
    document.addEventListener('touchmove', (event) => {
      if (!this.isActive) return;
      const touch = findTouch(event.touches, this.activePointerId);
      if (!touch) return;
      event.preventDefault();
      const direction = this.directionAtPoint(touch.clientX, touch.clientY);
      if (direction) this.changeDirection(direction);
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
