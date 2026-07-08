// js/progress.js
const ProgressLogic = {
  KEY: 'coreo_stage1_level',
  init: function() {
    if (!localStorage.getItem(this.KEY)) localStorage.setItem(this.KEY, 1);
  },
  getCurrentLevel: function() {
    return parseInt(localStorage.getItem(this.KEY)) || 1;
  },
  saveLevel: function(lv) {
    localStorage.setItem(this.KEY, lv);
  }
};
