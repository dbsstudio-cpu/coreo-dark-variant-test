// js/rail-assist.js — COREO DARK v0.10.1
// Spatial turn assistance for short mobile gestures. A turn is assisted only after
// ControlLogic has accepted an explicit direction command.
const RailAssist = {
  VERSION: 'v0.10.1',
  NORMAL_CORNER_GRACE: 14,
  HIDE_POCKET_CORNER_GRACE: 18,
  TURN_BUFFER_MS: 750,
  TURN_BUFFER_DISTANCE: 100,
  HIDE_POCKET_ENTRY_SPEED: 0.86,

  cellType: function(maze, cell) {
    if (!maze || !cell || !maze[cell.y]) return 0;
    return maze[cell.y][cell.x] ?? 0;
  },

  destinationCell: function(cell, direction) {
    return { x: cell.x + direction.x, y: cell.y + direction.y };
  },

  destinationType: function(maze, cell, direction) {
    if (!direction) return 0;
    return this.cellType(maze, this.destinationCell(cell, direction));
  },

  cornerGrace: function(maze, cell, direction) {
    return this.destinationType(maze, cell, direction) === 6
      ? this.HIDE_POCKET_CORNER_GRACE
      : this.NORMAL_CORNER_GRACE;
  },

  entrySpeedScale: function(maze, cell, direction) {
    return this.destinationType(maze, cell, direction) === 6
      ? this.HIDE_POCKET_ENTRY_SPEED
      : 1;
  },

  queueExpired: function(queue, playerPos, now) {
    if (!queue || !playerPos) return true;
    const age = Math.max(0, now - queue.timestamp);
    const travelled = Math.abs(playerPos.x - queue.origin.x) + Math.abs(playerPos.y - queue.origin.y);
    return age > this.TURN_BUFFER_MS || travelled > this.TURN_BUFFER_DISTANCE;
  }
};
