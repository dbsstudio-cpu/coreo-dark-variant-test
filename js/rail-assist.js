// js/rail-assist.js — COREO DARK v0.10.5
// Target-bound turn assistance. A queued turn belongs to one specific legal cell
// and expires after that cell; it can never drift to a later intersection.
const RailAssist = {
  VERSION: 'v0.10.5',
  NORMAL_CORNER_GRACE: 18,
  HIDE_POCKET_CORNER_GRACE: 22,
  TURN_TARGET_LOOKAHEAD_PX: 75,
  TARGET_TURN_MAX_AGE_MS: 350,
  HIDE_POCKET_ENTRY_SPEED: 0.86,

  cellType: function(maze, cell) {
    if (!maze || !cell || !maze[cell.y]) return 0;
    return maze[cell.y][cell.x] ?? 0;
  },

  isOpenCell: function(maze, cell) {
    return this.cellType(maze, cell) !== 0;
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

  centerOfCell: function(cell, cellSize) {
    return {
      x: cell.x * cellSize + cellSize / 2,
      y: cell.y * cellSize + cellSize / 2
    };
  },

  sameCell: function(a, b) {
    return !!(a && b && a.x === b.x && a.y === b.y);
  },

  signedDistanceToTarget: function(position, target) {
    if (!position || !target?.targetCenter || !target?.approachDirection) return Infinity;
    const axis = target.targetAxis;
    const sign = target.approachDirection[axis];
    return (target.targetCenter[axis] - position[axis]) * sign;
  },

  findNearestLegalTurnAhead: function({
    maze,
    position,
    railDirection,
    desiredDirection,
    cellSize,
    maxDistance = this.TURN_TARGET_LOOKAHEAD_PX
  }) {
    if (!maze || !position || !railDirection || !desiredDirection || !cellSize) return null;
    const targetAxis = railDirection.x !== 0 ? 'x' : 'y';
    const sign = railDirection[targetAxis];
    if (!sign || (desiredDirection.x !== 0) === (railDirection.x !== 0)) return null;

    const startCell = {
      x: Math.floor(position.x / cellSize),
      y: Math.floor(position.y / cellSize)
    };
    let cell = { ...startCell };
    const maxSteps = Math.ceil(maxDistance / cellSize) + 2;

    for (let step = 0; step <= maxSteps; step += 1) {
      const center = this.centerOfCell(cell, cellSize);
      const distance = (center[targetAxis] - position[targetAxis]) * sign;
      const grace = this.cornerGrace(maze, cell, desiredDirection);
      const legalTurn = this.isOpenCell(maze, this.destinationCell(cell, desiredDirection));

      if (legalTurn && distance >= -grace && distance <= maxDistance) {
        return {
          cell: { ...cell },
          center,
          axis: targetAxis,
          grace,
          isHidePocket: this.destinationType(maze, cell, desiredDirection) === 6,
          distance
        };
      }

      if (distance > maxDistance) break;
      const nextCell = this.destinationCell(cell, railDirection);
      if (!this.isOpenCell(maze, nextCell)) break;
      cell = nextCell;
    }
    return null;
  },

  hasPassedTargetBeyondGrace: function(position, target) {
    return this.signedDistanceToTarget(position, target) < -target.targetGrace;
  },

  isInsideTargetExecutionWindow: function(position, target) {
    const distance = this.signedDistanceToTarget(position, target);
    return distance <= 0 && distance >= -target.targetGrace;
  },

  queueExpired: function(queue, playerPos, now) {
    if (!queue || !playerPos) return true;
    const age = Math.max(0, now - queue.createdAt);
    return age > this.TARGET_TURN_MAX_AGE_MS || this.hasPassedTargetBeyondGrace(playerPos, queue);
  }
};
