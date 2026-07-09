// js/maze.js
const MazeLogic = {
  // 0: wall, 1: path, 2: start, 3: exit, 4: light core, 5: boost core, 6: hide pocket
  // 7x47 Stage01 v2.9.1: longer first-stage route, short hide pockets, reward dead ends.
  getTestCorridor: function() {
    const map = [
      [0,0,0,3,0,0,0], // y=0  Exit
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,1,1,1,1,1,0], // y=6  Hall H
      [0,1,0,0,0,5,0], // reward dead end
      [0,1,0,0,0,0,0],
      [0,1,0,0,0,0,0],
      [0,1,0,0,0,0,0],
      [0,1,0,0,0,0,0],
      [0,1,1,1,1,1,0], // y=12 Hall G
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0],
      [0,1,1,1,4,1,0], // y=16 Hall F
      [0,1,0,0,0,0,0],
      [0,1,1,1,1,1,0], // y=18 Hall E
      [0,0,0,0,0,1,0],
      [0,0,0,0,6,1,0], // short hide pocket
      [0,0,0,0,0,1,0],
      [0,0,0,0,0,1,0],
      [0,0,0,0,0,1,0],
      [0,1,1,1,1,1,0], // y=24 Hall D
      [0,1,0,0,0,0,0],
      [0,1,0,0,0,0,0],
      [0,1,6,1,0,0,0], // short hide pocket beside patrol pressure
      [0,1,0,1,0,0,0], // bypass lane
      [0,1,1,1,1,1,0], // y=29 Hall C
      [0,1,1,1,0,1,0], // enemy patrol can bend here without sealing route
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,1,1,1,1,1,0], // y=34 Hall B
      [0,1,0,0,0,4,0], // reward branch
      [0,1,1,1,1,1,0], // y=36 Hall A
      [0,0,0,0,0,1,0],
      [0,0,0,0,0,1,0],
      [0,0,0,0,0,1,0],
      [0,1,1,1,1,1,0], // y=40 Start approach
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,4,1,1,1,0], // y=44 first branch/core
      [0,0,0,1,0,0,0],
      [0,0,0,2,0,0,0]  // y=46 Start
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
    if (!start || !exit) {
      console.error('[Maze] Missing start or exit.');
      return false;
    }
    const queue = [start];
    const visited = new Set([`${start.x},${start.y}`]);
    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.x === exit.x && curr.y === exit.y) return true;
      const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
      for (const d of dirs) {
        const nx = curr.x + d[0], ny = curr.y + d[1];
        if (ny >= 0 && ny < maze.length && nx >= 0 && nx < maze[0].length) {
          if (maze[ny][nx] !== 0 && !visited.has(`${nx},${ny}`)) {
            visited.add(`${nx},${ny}`);
            queue.push({x: nx, y: ny});
          }
        }
      }
    }
    console.error('[Maze] Unsolvable corridor.');
    return false;
  }
};
