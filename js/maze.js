// js/maze.js
const MazeLogic = {
  // 0:牆壁, 1:路徑, 2:起點, 3:出口, 4:一般能量, 5:強化能量, 6:躲藏凹槽
  // 7x39，Stage01 v0.5.7：中段左側巡邏 + 右側繞路 + 有效躲藏凹槽
  getTestCorridor: function() {
    const map = [
      [0,0,0,3,0,0,0], // y=0  Exit
      [0,1,1,1,1,1,0], // y=1
      [0,1,0,0,0,1,0], // y=2
      [0,1,4,1,0,1,0], // y=3
      [0,0,0,1,0,1,0], // y=4
      [0,1,1,1,0,1,0], // y=5
      [0,1,0,0,0,1,0], // y=6
      [0,1,0,1,1,1,0], // y=7
      [0,1,0,1,0,0,0], // y=8
      [0,1,1,1,1,6,0], // y=9 upper hide pocket
      [0,0,0,1,0,0,0], // y=10
      [0,1,1,1,1,4,0], // y=11 reward branch
      [0,1,0,0,0,1,0], // y=12
      [0,1,0,1,1,1,0], // y=13
      [0,1,0,1,0,0,0], // y=14
      [0,1,1,1,0,1,0], // y=15
      [0,0,0,1,0,1,0], // y=16
      [0,1,1,1,1,1,0], // y=17 Mid enemy zone
      [0,1,0,0,0,1,0], // y=18
      [0,1,6,0,4,1,0], // y=19 hide pocket + reward core
      [0,1,0,0,0,1,0], // y=20
      [0,1,1,5,1,1,0], // y=21 boost core + bypass merge
      [0,0,0,1,0,0,0], // y=22
      [0,1,1,1,4,1,0], // y=23
      [0,1,0,0,0,1,0], // y=24
      [0,1,0,4,0,1,0], // y=25 short reward dead-end
      [0,1,1,1,1,1,0], // y=26
      [0,0,0,1,0,0,0], // y=27
      [0,1,4,1,1,1,0], // y=28
      [0,1,0,0,0,1,0], // y=29
      [0,6,1,1,0,1,0], // y=30 lower hide pocket
      [0,0,0,1,0,1,0], // y=31
      [0,1,1,1,0,1,0], // y=32
      [0,1,0,0,0,1,0], // y=33
      [0,1,0,1,1,1,0], // y=34
      [0,1,0,1,0,0,0], // y=35
      [0,1,4,1,1,1,0], // y=36 first visible reward branch
      [0,0,0,1,0,0,0], // y=37
      [0,0,0,2,0,0,0]  // y=38 Start
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


