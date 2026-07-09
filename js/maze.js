// js/maze.js
const MazeLogic = {
  // 0:牆壁, 1:路徑, 2:起點, 3:出口, 4:一般能量, 5:強化能量, 6:躲藏凹槽
  // 7x39，Gameplay Layer Stage01：拉長判斷時間，含純錯路/誤導型錯路/獎勵死路/躲藏凹槽
  getTestCorridor: function() {
    const map = [
      [0,0,0,3,0,0,0], // y=0  Exit
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,1,4,1,1,1,0], // y=3  Hall G
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0], // y=7  純錯路①
      [0,0,0,0,0,1,0],
      [0,1,1,1,1,1,0], // y=9  Hall F
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0], // y=15 誤導型錯路
      [0,1,0,0,0,0,0],
      [0,1,1,1,4,1,0], // y=17 Hall E
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0],
      [0,0,0,1,0,1,0], // y=21 純錯路②
      [0,0,0,0,0,1,0],
      [0,1,1,1,1,1,0], // y=23 Hall D
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,0,1,0,0,0],
      [0,1,0,5,0,0,0], // y=27 獎勵死路(強化能量)
      [0,1,0,1,0,0,0], // y=28 備用中線，避免反派巡邏壓住唯一通道
      [0,1,1,1,1,1,0], // y=29 Hall C
      [0,6,0,0,0,1,0], // y=30 躲藏凹槽
      [0,0,0,0,0,1,0],
      [0,1,1,1,1,1,0], // y=32 Hall B
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
      [0,1,1,4,1,1,0], // y=35 Hall A
      [0,0,0,1,0,0,0],
      [0,0,0,1,0,0,0],
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


