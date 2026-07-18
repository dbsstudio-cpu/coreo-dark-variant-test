// js/cc_diagnostic_control.js — COREO CC Diagnostic Lab R2.0
// 最近手指增量 -> 一次性方向命令。沒有固定中心、跟隨錨點或 FOLLOW 半徑。
const CCDiagnosticControl = {
  VERSION: 'R2.0',
  isActive: false,
  pointerId: null,
  lastPointerX: 0,
  lastPointerY: 0,
  lastPointerTime: 0,
  accumulatedDX: 0,
  accumulatedDY: 0,
  accumulationStartTime: 0,
  rawDirection: null,
  acceptedDirection: null,
  commandId: 0,
  latestCommand: null,
  commandQueue: [],
  lastEventInterval: 0,
  lastDX: 0,
  lastDY: 0,
  inputLatency: 0,
  endReason: 'NONE',

  // 同軸反向刻意比換軸更敏感；數字是診斷起點，不是正式版定案值。
  REVERSE_THRESHOLD: 5,
  TURN_THRESHOLD: 7,
  AXIS_BIAS: 1.06,

  sameDirection: function(a, b) {
    return !!(a && b && a.x === b.x && a.y === b.y);
  },

  isOpposite: function(a, b) {
    return !!(a && b && a.x === -b.x && a.y === -b.y);
  },

  resetAccumulation: function() {
    this.accumulatedDX = 0;
    this.accumulatedDY = 0;
    this.accumulationStartTime = 0;
  },

  emitCommand: function(type, direction, source, now) {
    this.commandId += 1;
    this.latestCommand = {
      id: this.commandId,
      type,
      direction: direction ? { x: direction.x, y: direction.y } : null,
      timestamp: now,
      source
    };
    this.commandQueue.push(this.latestCommand);
    if (this.commandQueue.length > 64) this.commandQueue.shift();
    if (type === 'direction') this.acceptedDirection = { x: direction.x, y: direction.y };
    if (type === 'stop') this.acceptedDirection = null;
    return this.latestCommand;
  },

  chooseDirection: function() {
    const dx = this.accumulatedDX;
    const dy = this.accumulatedDY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const current = this.acceptedDirection;

    // 反向不套用換軸遲滯，5px 即可成立。
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

    // 同方向片段只用來更新最近比較起點，不重送相同命令。
    if (current.x !== 0 && ax >= this.TURN_THRESHOLD && ax >= ay) return { x: dx > 0 ? 1 : -1, y: 0 };
    if (current.y !== 0 && ay >= this.TURN_THRESHOLD && ay >= ax) return { x: 0, y: dy > 0 ? 1 : -1 };
    return null;
  },

  start: function(x, y, id, now = performance.now()) {
    if (this.isActive) return;
    this.isActive = true;
    this.pointerId = id;
    this.lastPointerX = x;
    this.lastPointerY = y;
    this.lastPointerTime = now;
    this.lastDX = 0;
    this.lastDY = 0;
    this.lastEventInterval = 0;
    this.rawDirection = null;
    this.endReason = 'NONE';
    this.resetAccumulation();
  },

  move: function(x, y, now = performance.now()) {
    if (!this.isActive) return null;
    const previousTime = this.lastPointerTime || now;
    const dx = x - this.lastPointerX;
    const dy = y - this.lastPointerY;
    this.lastEventInterval = Math.max(0, now - previousTime);
    this.lastPointerX = x;
    this.lastPointerY = y;
    this.lastPointerTime = now;
    this.lastDX = dx;
    this.lastDY = dy;

    if (dx === 0 && dy === 0) return null;
    if (this.accumulationStartTime === 0) this.accumulationStartTime = previousTime;

    // 一偵測到手勢分量變號，就丟掉舊方向殘值；反向不必先抵銷上一段累積量。
    let changedSegment = false;
    if (this.accumulatedDX !== 0 && dx !== 0 && Math.sign(dx) !== Math.sign(this.accumulatedDX)) {
      this.accumulatedDX = 0;
      changedSegment = true;
    }
    if (this.accumulatedDY !== 0 && dy !== 0 && Math.sign(dy) !== Math.sign(this.accumulatedDY)) {
      this.accumulatedDY = 0;
      changedSegment = true;
    }
    if (changedSegment) this.accumulationStartTime = previousTime;
    this.accumulatedDX += dx;
    this.accumulatedDY += dy;

    const direction = this.chooseDirection();
    if (!direction) return null;

    this.rawDirection = { x: direction.x, y: direction.y };
    this.inputLatency = Math.max(0, now - this.accumulationStartTime);
    const changed = !this.sameDirection(direction, this.acceptedDirection);
    this.resetAccumulation();
    return changed ? this.emitCommand('direction', direction, 'pointer-delta', now) : null;
  },

  end: function(reason = 'pointerup', now = performance.now()) {
    if (!this.isActive) return null;
    this.isActive = false;
    this.pointerId = null;
    this.rawDirection = null;
    this.endReason = reason;
    this.resetAccumulation();
    return this.emitCommand('stop', null, reason, now);
  },

  getCommandAfter: function(lastConsumedId) {
    return this.commandQueue.find((command) => command.id > lastConsumedId) || null;
  },

  getCommandsAfter: function(lastConsumedId) {
    return this.commandQueue.filter((command) => command.id > lastConsumedId);
  },

  getDiagnostics: function() {
    return {
      isActive: this.isActive,
      rawDirection: this.rawDirection,
      acceptedDirection: this.acceptedDirection,
      commandId: this.commandId,
      commandTime: this.latestCommand ? this.latestCommand.timestamp : 0,
      lastEventInterval: this.lastEventInterval,
      lastDX: this.lastDX,
      lastDY: this.lastDY,
      accumulatedDX: this.accumulatedDX,
      accumulatedDY: this.accumulatedDY,
      inputLatency: this.inputLatency,
      endReason: this.endReason
    };
  },

  init: function(zoneEl) {
    if (!zoneEl) throw new Error('CC Diagnostic control zone not found');
    const eventTime = () => performance.now();

    if (window.PointerEvent) {
      zoneEl.addEventListener('pointerdown', (e) => {
        if (this.isActive) return;
        e.preventDefault();
        try { zoneEl.setPointerCapture?.(e.pointerId); } catch (_) { /* Safari may reject capture during teardown. */ }
        this.start(e.clientX, e.clientY, e.pointerId, eventTime());
      }, { passive: false });
      zoneEl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.move(e.clientX, e.clientY, eventTime());
      }, { passive: false });
      const finish = (e, reason) => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.end(reason, eventTime());
      };
      zoneEl.addEventListener('pointerup', (e) => finish(e, 'pointerup'), { passive: false });
      zoneEl.addEventListener('pointercancel', (e) => finish(e, 'pointercancel'), { passive: false });
      zoneEl.addEventListener('lostpointercapture', (e) => {
        if (e.pointerId === this.pointerId) this.end('lostcapture', eventTime());
      });
      return;
    }

    // 只供不支援 Pointer Events 的舊瀏覽器；以 identifier 鎖定單一觸點。
    const findTouch = (list, id) => Array.from(list || []).find((t) => id === null || t.identifier === id) || null;
    zoneEl.addEventListener('touchstart', (e) => {
      if (this.isActive) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      e.preventDefault();
      this.start(t.clientX, t.clientY, t.identifier, eventTime());
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (!this.isActive) return;
      const t = findTouch(e.touches, this.pointerId);
      if (!t) return;
      e.preventDefault();
      this.move(t.clientX, t.clientY, eventTime());
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
      if (!this.isActive || !findTouch(e.changedTouches, this.pointerId)) return;
      e.preventDefault();
      this.end('touchend', eventTime());
    }, { passive: false });
    document.addEventListener('touchcancel', (e) => {
      if (!this.isActive) return;
      e.preventDefault();
      this.end('touchcancel', eventTime());
    }, { passive: false });
  },

  // 自動測試掛勾：走相同的命令產生路徑，不直接改內部 intent。
  debugStart: function(x = 100, y = 100, now = performance.now()) { this.start(x, y, 999, now); },
  debugMove: function(x, y, now = performance.now()) { return this.move(x, y, now); },
  debugEnd: function(now = performance.now()) { return this.end('debug-stop', now); }
};
