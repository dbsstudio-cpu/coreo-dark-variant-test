// js/control.js — COREO DARK v0.10.4
// 在 v0.10.2「最近增量累積 → 一次性方向命令」基礎上，加入一項針對 iOS/mini 拇指弧線急轉的修正。
//
// 問題（CC 對照實際碼 + 模擬驗證）：
//   往某方向走一段路時，該「沿軸」累積量會一直長大、直行期間從不歸零，
//   大到之後任何側向轉彎意圖都追不上它 → 拇指弧線急轉偶發漏判（mini 最明顯）。
//   單純調低 AXIS_BIAS（GPT 建議的 1.15）在真實收斂弧線下仍無法轉（模擬證實）。
//   直接清空舊軸又會讓持續斜拉在兩軸間震盪（U R U R）。
//
// 修正：對「與當前行進方向同向」的沿軸累積做溫和衰減(leaky ×AXIS_DECAY)，
//   讓換軸判定反映「最近的手指動向」而非「整段行程的累積」。
//   只衰減同向沿軸；反向(opposite)與跨軸(turn)訊號完整保留 → 反向與抗抖動不受影響（模擬證實）。
//
// v0.10.3→v0.10.4 熱修：AXIS_DECAY 0.5 太猛，真機在轉角處出現 U-R-U-R 震盪＝「進彎頓一下、抖一下才轉」
//   （iOS/Android 皆有，因屬純輸入邏輯）。模擬證實改 0.7 後淺/中/陡弧皆乾淨轉一次、零震盪，
//   反向與抗抖動不受影響。本檔唯一改動＝AXIS_DECAY 0.5 → 0.7。
//
// 命令介面（emitCommand / commandId / getCommandsAfter / type:'direction'|'stop'）與 v0.10.2 完全相同
//   → main.js 與 rail-assist.js 一行都不用改。
const ControlLogic = {
  VERSION: 'v0.10.4',
  dx: 0,
  dy: 0,
  isActive: false,
  activePointerId: null,
  lastPointerX: 0,
  lastPointerY: 0,
  accumulatedDX: 0,
  accumulatedDY: 0,
  acceptedDirection: null,
  commandId: 0,
  commandQueue: [],
  zoneElement: null,

  // 門檻沿用 v0.9.8/v0.10.2 驗證值。AXIS_BIAS 保留 1.3 作為「非弧線情況」的穩定值；
  // 若 mini 真機仍偏鈍，這是次要旋鈕，可依任務包階梯降到 1.15 / 1.10。
  REVERSE_THRESHOLD: 11,
  TURN_THRESHOLD: 13,
  AXIS_BIAS: 1.3,
  REVERSE_AXIS_BIAS: 1.15,
  // 同向沿軸累積的每步衰減係數（本輪解「弧線急轉」的主要旋鈕）。
  // v0.10.4：0.5 會在轉角震盪(U-R-U-R)→抖動停頓，改 0.7 乾淨轉一次。
  // 調節：0.75 更穩(更不易誤震盪)｜0.65 更易轉(若真機偏鈍)。不建議 ≤0.6(會回到震盪)。
  AXIS_DECAY: 0.7,

  sameDirection: function(a, b) {
    return !!(a && b && a.x === b.x && a.y === b.y);
  },

  resetAccumulation: function() {
    this.accumulatedDX = 0;
    this.accumulatedDY = 0;
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

  chooseDirection: function() {
    const dx = this.accumulatedDX;
    const dy = this.accumulatedDY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const current = this.acceptedDirection;

    // 同軸反向：最容易觸發
    if (current && current.x !== 0 && dx * current.x < 0 && ax >= this.REVERSE_THRESHOLD && ax >= ay * this.REVERSE_AXIS_BIAS) {
      return { x: dx > 0 ? 1 : -1, y: 0 };
    }
    if (current && current.y !== 0 && dy * current.y < 0 && ay >= this.REVERSE_THRESHOLD && ay >= ax * this.REVERSE_AXIS_BIAS) {
      return { x: 0, y: dy > 0 ? 1 : -1 };
    }

    // 靜止起步
    if (!current) {
      if (ax >= this.TURN_THRESHOLD || ay >= this.TURN_THRESHOLD) {
        return ax >= ay ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
      }
      return null;
    }

    // 垂直／水平換軸
    if (current.x !== 0 && ay >= this.TURN_THRESHOLD && ay >= ax * this.AXIS_BIAS) {
      return { x: 0, y: dy > 0 ? 1 : -1 };
    }
    if (current.y !== 0 && ax >= this.TURN_THRESHOLD && ax >= ay * this.AXIS_BIAS) {
      return { x: dx > 0 ? 1 : -1, y: 0 };
    }
    return null;
  },

  start: function(x, y, pointerId) {
    if (this.isActive) return;
    this.isActive = true;
    this.activePointerId = pointerId;
    this.lastPointerX = x;
    this.lastPointerY = y;
    this.resetAccumulation();
  },

  move: function(x, y, now = performance.now()) {
    if (!this.isActive) return null;
    const dx = x - this.lastPointerX;
    const dy = y - this.lastPointerY;
    this.lastPointerX = x;
    this.lastPointerY = y;
    if (dx === 0 && dy === 0) return null;

    // 軸向反轉時清掉舊累積，讓「最近一段滑動」才是判定依據
    if (this.accumulatedDX !== 0 && dx !== 0 && Math.sign(dx) !== Math.sign(this.accumulatedDX)) this.accumulatedDX = 0;
    if (this.accumulatedDY !== 0 && dy !== 0 && Math.sign(dy) !== Math.sign(this.accumulatedDY)) this.accumulatedDY = 0;
    this.accumulatedDX += dx;
    this.accumulatedDY += dy;

    // v0.10.3：對「與當前行進方向同向」的沿軸累積做溫和衰減（leaky integrator）。
    // 直行本身不需要靠累積（railDirection 已持續前進），衰減它只讓「換軸判定」反映最近動向；
    // 反向（accumulatedD* 與 accepted 反號）與跨軸（另一軸）訊號完整保留，不受影響。
    if (this.acceptedDirection) {
      if (this.acceptedDirection.y !== 0 && Math.sign(this.accumulatedDY) === Math.sign(this.acceptedDirection.y)) {
        this.accumulatedDY *= this.AXIS_DECAY;
      }
      if (this.acceptedDirection.x !== 0 && Math.sign(this.accumulatedDX) === Math.sign(this.acceptedDirection.x)) {
        this.accumulatedDX *= this.AXIS_DECAY;
      }
    }

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
    return hadInput ? this.emitCommand('stop', null, source, now) : null;
  },

  getCommandsAfter: function(lastConsumedId) {
    return this.commandQueue.filter((command) => command.id > lastConsumedId);
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
