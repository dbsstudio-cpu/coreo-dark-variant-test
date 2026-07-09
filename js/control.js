// js/control.js
const ControlLogic = {
  dx: 0,
  dy: 0,
  isActive: false,
  activePointerId: null,
  baseX: 0,
  baseY: 0,
  maxRadius: 54,

  init: function() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');

    const setBase = (x, y) => {
      this.baseX = x;
      this.baseY = y;
      this.dx = 0;
      this.dy = 0;
      base.style.left = `${x}px`;
      base.style.top = `${y}px`;
      base.classList.add('active');
      knob.style.transform = 'translate(-50%, -50%)';
    };

    const updateVector = (x, y) => {
      let deltaX = x - this.baseX;
      let deltaY = y - this.baseY;
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

    const stop = () => {
      this.isActive = false;
      this.activePointerId = null;
      this.dx = 0;
      this.dy = 0;
      base.classList.remove('active');
      knob.style.transform = 'translate(-50%, -50%)';
    };

    if (window.PointerEvent) {
      zone.addEventListener('pointerdown', (event) => {
        if (this.isActive) return;
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

  getVector: function() {
    return { x: this.dx, y: this.dy };
  }
};
