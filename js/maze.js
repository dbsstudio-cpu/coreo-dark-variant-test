// js/maze.js
const MazeLogic = {
  // 0:牆壁, 1:路徑, 2:起點, 3:出口, 4:一般能量, 5:強化能量
  getTestCorridor: function() {
    const map = [
      [0,0,0,3,0,0,0],
      [0,1,1,1,0,0,0],
      [0,1,0,0,0,0,0],
      [0,1,1,1,0,0,0],
      [0,0,0,5,0,0,0],
      [0,0,0,1,1,1,0],
      [0,0,0,0,0,1,0],
      [0,0,0,1,1,1,0],
      [0,0,0,1,0,0,0],
      [0,1,1,4,0,0,0],
      [0,1,0,0,0,0,0],
      [0,1,1,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,0,0,1,1,1,0],
      [0,0,0,0,0,1,0],
      [0,0,0,1,1,1,0],
      [0,0,0,1,0,0,0],
      [0,4,1,1,0,0,0],
      [0,1,0,0,0,0,0],
      [0,1,1,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,0,0,2,0,0,0]
    ];
    this.verifySolvable(map);
    return map;
  },

  verifySolvable: function(maze) {
    let start = null, exit = null;
    for (let y = 0; y < maze.length; y++) {
      for (let x = 0; x < maze[y].length; x++) {
        if (maze[y][x] === 2) start = {x, y};
        if (maze[y][x] === 3) exit = {x, y};
      }
    }
    let queue = [start];
    let visited = new Set([`${start.x},${start.y}`]);
    while (queue.length > 0) {
      let curr = queue.shift();
      if (curr.x === exit.x && curr.y === exit.y) return true;
      const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
      for (let d of dirs) {
        let nx = curr.x + d[0], ny = curr.y + d[1];
        if (ny >= 0 && ny < maze.length && nx >= 0 && nx < maze[0].length) {
          if (maze[ny][nx] !== 0 && !visited.has(`${nx},${ny}`)) {
            visited.add(`${nx},${ny}`);
            queue.push({x: nx, y: ny});
          }
        }
      }
    }
    console.error('[Maze] 驗證失敗：無解的走廊！');
    return false;
  }
};
