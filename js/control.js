// js/control.js — COREO DARK v0.10.5
// Fixed-time pointer sampling with an early turn intent and a separately confirmed
// direction. Direction decisions depend on physical movement during the latest
// INPUT_WINDOW_MS, not on how many pointermove events a browser emits.
const ControlLogic = {
  VERSION: 'v0.10.5',
  CONTROL_TARGETED_TURN_V0105: true,
  dx: 0,
  dy: 0,
  isActive: false,
  activePointerId: null,
  acceptedDirection: null,
  turnIntent: null,
  samples: [],
  commandId: 0,
  commandQueue: [],
  zoneElement: null,

  INPUT_WINDOW_MS: 64,
  TURN_INTENT_MIN_PX: 5,
  TURN_INTENT_RATIO: 0.65,
  TURN_CONFIRM_MIN_PX: 11,
  TURN_CONFIRM_RATIO: 1.10,
  REVERSE_MIN_PX: 11,

  sameDirection: function(a, b) {
    return !!(a && b && a.x === b.x && a.y === b.y);
  },

  cloneDirection: function(direction) {
    return direction ? { x: direction.x, y: direction.y } : null;
  },

  resetSamples: function(x = null, y = null, now = null) {
    this.samples.length = 0;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(now)) {
      this.samples.push({ x, y, t: now });
    }
  },

  normalizeTimestamp: function(now) {
    const fallback = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const candidate = Number.isFinite(now) ? now : fallback;
    const last = this.samples[this.samples.length - 1];
    return last ? Math.max(last.t, candidate) : candidate;
  },

  emitCommand: function(type, direction, source, now, extra = {}) {
    this.commandId += 1;
    const command = {
      id: this.commandId,
      type,
      direction: this.cloneDirection(direction),
      source,
      timestamp: now,
      ...extra
    };
    this.commandQueue.push(command);
    if (this.commandQueue.length > 96) this.commandQueue.shift();

    if (type === 'direction') {
      this.acceptedDirection = this.cloneDirection(direction);
      this.dx = direction.x;
      this.dy = direction.y;
    } else if (type === 'stop') {
      this.acceptedDirection = null;
      this.turnIntent = null;
      this.dx = 0;
      this.dy = 0;
    }
    return command;
  },

  getWindowVector: function() {
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    return {
      dx: last.x - first.x,
      dy: last.y - first.y,
      dt: Math.max(1, last.t - first.t)
    };
  },

  detectReverse: function(vector, currentDirection) {
    if (!vector || !currentDirection) return null;
    if (currentDirection.x !== 0) {
      const opposite = Math.sign(vector.dx) === -Math.sign(currentDirection.x);
      if (opposite && Math.abs(vector.dx) >= this.REVERSE_MIN_PX) {
        return { x: Math.sign(vector.dx), y: 0 };
      }
    }
    if (currentDirection.y !== 0) {
      const opposite = Math.sign(vector.dy) === -Math.sign(currentDirection.y);
      if (opposite && Math.abs(vector.dy) >= this.REVERSE_MIN_PX) {
        return { x: 0, y: Math.sign(vector.dy) };
      }
    }
    return null;
  },

  detectTurnIntent: function(vector, currentDirection) {
    if (!vector || !currentDirection) return null;
    const ax = Math.abs(vector.dx);
    const ay = Math.abs(vector.dy);
    if (currentDirection.x !== 0) {
      if (ay >= this.TURN_INTENT_MIN_PX && ay >= ax * this.TURN_INTENT_RATIO) {
        return { x: 0, y: Math.sign(vector.dy) };
      }
    } else if (currentDirection.y !== 0) {
      if (ax >= this.TURN_INTENT_MIN_PX && ax >= ay * this.TURN_INTENT_RATIO) {
        return { x: Math.sign(vector.dx), y: 0 };
      }
    }
    return null;
  },

  detectConfirmedTurn: function(vector, currentDirection) {
    if (!vector || !currentDirection) return null;
    const ax = Math.abs(vector.dx);
    const ay = Math.abs(vector.dy);
    if (currentDirection.x !== 0) {
      if (ay >= this.TURN_CONFIRM_MIN_PX && ay >= ax * this.TURN_CONFIRM_RATIO) {
        return { x: 0, y: Math.sign(vector.dy) };
      }
    } else if (currentDirection.y !== 0) {
      if (ax >= this.TURN_CONFIRM_MIN_PX && ax >= ay * this.TURN_CONFIRM_RATIO) {
        return { x: Math.sign(vector.dx), y: 0 };
      }
    }
    return null;
  },

  detectStartingDirection: function(vector) {
    if (!vector) return null;
    const ax = Math.abs(vector.dx);
    const ay = Math.abs(vector.dy);
    if (Math.max(ax, ay) < this.TURN_CONFIRM_MIN_PX) return null;
    return ax >= ay
      ? { x: Math.sign(vector.dx), y: 0 }
      : { x: 0, y: Math.sign(vector.dy) };
  },

  evaluateInput: function(now) {
    const vector = this.getWindowVector();
    if (!vector) return null;

    if (!this.acceptedDirection) {
      const startingDirection = this.detectStartingDirection(vector);
      if (!startingDirection) return null;
      const command = this.emitCommand('direction', startingDirection, 'window-start', now, {
        basisDirection: null
      });
      const last = this.samples[this.samples.length - 1];
      this.resetSamples(last.x, last.y, last.t);
      return command;
    }

    const reverse = this.detectReverse(vector, this.acceptedDirection);
    if (reverse) {
      const basisDirection = this.cloneDirection(this.acceptedDirection);
      this.turnIntent = null;
      const command = this.emitCommand('direction', reverse, 'window-reverse', now, {
        basisDirection
      });
      const last = this.samples[this.samples.length - 1];
      this.resetSamples(last.x, last.y, last.t);
      return command;
    }

    const intentDirection = this.detectTurnIntent(vector, this.acceptedDirection);
    if (intentDirection && !this.sameDirection(intentDirection, this.turnIntent?.direction)) {
      const intentCommand = this.emitCommand('turn-intent', intentDirection, 'window-intent', now);
      this.turnIntent = {
        commandId: intentCommand.id,
        direction: this.cloneDirection(intentDirection),
        createdAt: now
      };
    }

    const confirmedDirection = this.detectConfirmedTurn(vector, this.acceptedDirection);
    if (!confirmedDirection || this.sameDirection(confirmedDirection, this.acceptedDirection)) return null;

    const intentCommandId = this.sameDirection(confirmedDirection, this.turnIntent?.direction)
      ? this.turnIntent.commandId
      : null;
    const command = this.emitCommand('direction', confirmedDirection, 'window-confirmed', now, {
      intentCommandId,
      basisDirection: this.cloneDirection(this.acceptedDirection)
    });
    this.turnIntent = null;
    const last = this.samples[this.samples.length - 1];
    this.resetSamples(last.x, last.y, last.t);
    return command;
  },

  ingestPointerSample: function(x, y, now) {
    if (!this.isActive || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const t = this.normalizeTimestamp(now);
    const last = this.samples[this.samples.length - 1];
    if (last && last.x === x && last.y === y && last.t === t) return null;

    this.samples.push({ x, y, t });
    const cutoff = t - this.INPUT_WINDOW_MS;
    while (this.samples.length > 2 && this.samples[1].t <= cutoff) this.samples.shift();
    if (this.samples.length > 1 && this.samples[0].t < cutoff) {
      const first = this.samples[0];
      const second = this.samples[1];
      const span = Math.max(1, second.t - first.t);
      const ratio = Math.min(1, Math.max(0, (cutoff - first.t) / span));
      this.samples[0] = {
        x: first.x + (second.x - first.x) * ratio,
        y: first.y + (second.y - first.y) * ratio,
        t: cutoff
      };
    }
    return this.evaluateInput(t);
  },

  start: function(x, y, pointerId, now = performance.now()) {
    if (this.isActive) return;
    this.isActive = true;
    this.activePointerId = pointerId;
    this.turnIntent = null;
    this.resetSamples(x, y, Number.isFinite(now) ? now : performance.now());
  },

  move: function(x, y, now = performance.now()) {
    return this.ingestPointerSample(x, y, now);
  },

  stop: function(source = 'stop', now = performance.now()) {
    const hadInput = this.isActive || this.acceptedDirection || this.dx !== 0 || this.dy !== 0;
    this.isActive = false;
    this.activePointerId = null;
    this.turnIntent = null;
    this.resetSamples();
    return hadInput ? this.emitCommand('stop', null, source, now) : null;
  },

  getCommandsAfter: function(lastConsumedId) {
    return this.commandQueue.filter((command) => command.id > lastConsumedId);
  },

  ingestPointerEvent: function(event) {
    let batch = [];
    if (typeof event.getCoalescedEvents === 'function') batch = event.getCoalescedEvents() || [];
    if (!batch.length) batch = [event];

    let result = null;
    for (const sample of batch) {
      result = this.ingestPointerSample(sample.clientX, sample.clientY, sample.timeStamp) || result;
    }
    const last = batch[batch.length - 1];
    if (last.clientX !== event.clientX || last.clientY !== event.clientY || last.timeStamp !== event.timeStamp) {
      result = this.ingestPointerSample(event.clientX, event.clientY, event.timeStamp) || result;
    }
    return result;
  },

  init: function() {
    const zone = document.getElementById('joystick-zone');
    this.zoneElement = zone;
    if (!zone) throw new Error('COREO control zone not found');

    if (window.PointerEvent) {
      zone.addEventListener('pointerdown', (event) => {
        if (this.isActive) return;
        event.preventDefault();
        try { zone.setPointerCapture?.(event.pointerId); } catch (_) { /* Safari teardown race. */ }
        this.start(event.clientX, event.clientY, event.pointerId, event.timeStamp);
      }, { passive: false });
      zone.addEventListener('pointermove', (event) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.ingestPointerEvent(event);
      }, { passive: false });
      const endPointer = (event, source) => {
        if (!this.isActive || event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.stop(source, event.timeStamp);
      };
      zone.addEventListener('pointerup', (event) => endPointer(event, 'pointerup'), { passive: false });
      zone.addEventListener('pointercancel', (event) => endPointer(event, 'pointercancel'), { passive: false });
      zone.addEventListener('lostpointercapture', (event) => {
        if (event.pointerId === this.activePointerId) this.stop('lostcapture', event.timeStamp);
      });
      return;
    }

    const findTouch = (list, id) => Array.from(list || []).find((touch) => id === null || touch.identifier === id) || null;
    zone.addEventListener('touchstart', (event) => {
      if (this.isActive) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      event.preventDefault();
      this.start(touch.clientX, touch.clientY, touch.identifier, event.timeStamp);
    }, { passive: false });
    document.addEventListener('touchmove', (event) => {
      if (!this.isActive) return;
      const touch = findTouch(event.touches, this.activePointerId);
      if (!touch) return;
      event.preventDefault();
      this.move(touch.clientX, touch.clientY, event.timeStamp);
    }, { passive: false });
    document.addEventListener('touchend', (event) => {
      if (!this.isActive || !findTouch(event.changedTouches, this.activePointerId)) return;
      event.preventDefault();
      this.stop('touchend', event.timeStamp);
    }, { passive: false });
    document.addEventListener('touchcancel', (event) => {
      if (!this.isActive) return;
      event.preventDefault();
      this.stop('touchcancel', event.timeStamp);
    }, { passive: false });
  },

  getVector: function() {
    return { x: this.dx, y: this.dy };
  }
};
