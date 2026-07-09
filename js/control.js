// js/control.js
const ControlLogic = {
  dx: 0, dy: 0,
  isActive: false,
  baseX: 0, baseY: 0,
  maxRadius: 52,

  init: function() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');

    const getPoint = (e) => {
      const touch = e.touches && e.touches.length ? e.touches[0] : null;
      const changed = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : null;
      const point = touch || changed || e;
      return { x: point.clientX, y: point.clientY };
    };

    const onStart = (e) => {
      e.preventDefault();
      const point = getPoint(e);
      this.isActive = true;
      this.baseX = point.x;
      this.baseY = point.y;
      this.dx = 0;
      this.dy = 0;

      base.style.left = `${this.baseX}px`;
      base.style.top = `${this.baseY}px`;
      base.classList.add('active');
      knob.style.transform = 'translate(-50%, -50%)';
    };

    const onMove = (e) => {
      if (!this.isActive) return;
      e.preventDefault();
      const point = getPoint(e);
      let deltaX = point.x - this.baseX;
      let deltaY = point.y - this.baseY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > this.maxRadius) {
        const ratio = this.maxRadius / distance;
        deltaX *= ratio;
        deltaY *= ratio;
      }

      knob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
      this.dx = deltaX / this.maxRadius;
      this.dy = deltaY / this.maxRadius;
    };

    const onEnd = (e) => {
      if (!this.isActive) return;
      e.preventDefault();
      this.isActive = false;
      this.dx = 0;
      this.dy = 0;
      base.classList.remove('active');
      knob.style.transform = 'translate(-50%, -50%)';
    };

    zone.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchcancel', onEnd, { passive: false });
    zone.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  },

  getVector: function() {
    return { x: this.dx, y: this.dy };
  }
};
