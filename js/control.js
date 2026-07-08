// js/control.js
const ControlLogic = {
  dx: 0, dy: 0,
  isActive: false,
  baseX: 0, baseY: 0,
  maxRadius: 48,

  init: function() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');

    const onStart = (e) => {
      e.preventDefault(); // 絕對禁止拖動網頁
      this.isActive = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      this.baseX = clientX; this.baseY = clientY;

      base.style.left = `${this.baseX}px`;
      base.style.top = `${this.baseY}px`;
      base.classList.add('active');
      knob.style.transform = `translate(-50%, -50%)`;
    };

    const onMove = (e) => {
      if (!this.isActive) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      let deltaX = clientX - this.baseX;
      let deltaY = clientY - this.baseY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > this.maxRadius) {
        const ratio = this.maxRadius / distance;
        deltaX *= ratio; deltaY *= ratio;
      }

      knob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;

      const normDist = Math.min(distance, this.maxRadius);
      this.dx = (deltaX / this.maxRadius) * (normDist / this.maxRadius);
      this.dy = (deltaY / this.maxRadius) * (normDist / this.maxRadius);
    };

    const onEnd = (e) => {
      e.preventDefault();
      this.isActive = false;
      this.dx = 0; this.dy = 0;
      base.classList.remove('active');
    };

    zone.addEventListener('touchstart', onStart, {passive: false});
    zone.addEventListener('touchmove', onMove, {passive: false});
    zone.addEventListener('touchend', onEnd, {passive: false});
    zone.addEventListener('touchcancel', onEnd, {passive: false});
    zone.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  },

  getVector: function() { return { x: this.dx, y: this.dy }; }
};
