// js/audio.js
const AudioLogic = {
  init: () => console.log('[Audio] 模組準備'),
  playSound: (evt) => console.log(`[Audio] 播放: ${evt}`) // evt對應: control_activate, wall_hit, core_collect, exit_activate 等
};
