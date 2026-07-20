const Stage03Ring = {
  centerX: 6,
  centerY: 9,
  map: [
    [0,0,0,0,0,0,2,0,0,0,0,0,0], // r0
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r1
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r2
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r3
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r4
    [0,0,0,0,0,1,1,1,0,0,0,0,0], // r5
    [0,0,0,0,1,1,0,1,1,0,0,0,0], // r6
    [0,0,0,1,1,0,0,0,1,1,0,0,0], // r7
    [0,0,1,1,0,0,0,0,0,1,1,0,0], // r8
    [0,0,1,0,0,0,7,0,0,0,1,1,1], // r9 (11, 12 is Right Exit)
    [0,0,1,1,0,0,0,0,0,1,1,0,0], // r10
    [0,0,0,1,1,0,0,0,1,1,0,0,0], // r11
    [0,0,0,0,1,1,0,1,1,0,0,0,0], // r12
    [0,0,0,0,0,1,1,1,0,0,0,0,0], // r13 (6 is Down Exit)
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r14
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r15
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r16
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r17
    [0,0,0,0,0,0,1,0,0,0,0,0,0], // r18
    [0,0,0,0,0,0,3,0,0,0,0,0,0]  // r19
  ],
  // 順時針連續走訪表
  ringPath: [
    {x:6,y:5}, {x:7,y:5}, {x:7,y:6}, {x:8,y:6}, {x:8,y:7}, {x:9,y:7}, {x:9,y:8}, {x:10,y:8}, {x:10,y:9},
    {x:10,y:10}, {x:9,y:10}, {x:9,y:11}, {x:8,y:11}, {x:8,y:12}, {x:7,y:12}, {x:7,y:13}, {x:6,y:13},
    {x:5,y:13}, {x:5,y:12}, {x:4,y:12}, {x:4,y:11}, {x:3,y:11}, {x:3,y:10}, {x:2,y:10}, {x:2,y:9},
    {x:2,y:8}, {x:3,y:8}, {x:3,y:7}, {x:4,y:7}, {x:4,y:6}, {x:5,y:6}, {x:5,y:5}
  ],
  RingMap: {},

  init() {
    // 建構環形切線與逆切線
    this.ringPath.forEach((cell, i) => {
      const next = this.ringPath[(i + 1) % this.ringPath.length];
      const prev = this.ringPath[(i - 1 + this.ringPath.length) % this.ringPath.length];
      this.RingMap[`${cell.x},${cell.y}`] = {
        cw: { x: Math.sign(next.x - cell.x), y: Math.sign(next.y - cell.y) },
        ccw: { x: Math.sign(prev.x - cell.x), y: Math.sign(prev.y - cell.y) },
        exits: []
      };
    });
    // 綁定三個出口點
    this.RingMap['10,9'].exits.push({x: 1, y: 0});  // 右出口
    this.RingMap['6,13'].exits.push({x: 0, y: 1});  // 下出口
    this.RingMap['6,5'].exits.push({x: 0, y: -1});  // 上退路

    this.verifySolvable(this.map);
  },

  verifySolvable(maze) {
    let start = null, exit = null;
    for (let y = 0; y < maze.length; y++) {
      for (let x = 0; x < maze[y].length; x++) {
        if (maze[y][x] === 2) start = {x, y};
        if (maze[y][x] === 3) exit = {x, y};
      }
    }
    let queue = [start], visited = new Set([`${start.x},${start.y}`]);
    while (queue.length > 0) {
      let curr = queue.shift();
      if (curr.x === exit.x && curr.y === exit.y) {
        console.log('[Maze] Stage 03 Lab 驗證通過：起點→下方出口已連通');
        return true;
      }
      for (let d of [[0,1],[1,0],[0,-1],[-1,0]]) {
        let nx = curr.x + d[0], ny = curr.y + d[1];
        if (ny >= 0 && ny < maze.length && nx >= 0 && nx < maze[0].length) {
          if (maze[ny][nx] !== 0 && maze[ny][nx] !== 7 && !visited.has(`${nx},${ny}`)) {
            visited.add(`${nx},${ny}`);
            queue.push({x: nx, y: ny});
          }
        }
      }
    }
    console.error('[Maze] Stage 03 Lab 驗證失敗：無解！');
    return false;
  }
};
Stage03Ring.init();
