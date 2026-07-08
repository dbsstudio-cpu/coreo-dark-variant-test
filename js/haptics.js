// js/haptics.js
const HapticsLogic = {
  isSupported: false,
  init: function() {
    this.isSupported = 'vibrate' in navigator;
    console.log(`[Haptics] 支援度: ${this.isSupported}`);
  },
  trigger: function(evt) {
    if (!this.isSupported) return;
    console.log(`[Haptics] 震動: ${evt}`);
    if (evt === 'wall_hit') navigator.vibrate(10);
    if (evt === 'core_collect') navigator.vibrate([15, 30, 15]);
    if (evt === 'level_success') navigator.vibrate([50, 50, 100]);
  }
};
