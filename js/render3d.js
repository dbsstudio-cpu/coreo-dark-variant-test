// js/render3d.js
const Render3D = {
  CELL_SIZE: 58,

  buildWorld: function(mazeData) {
    const world = document.getElementById('world');
    world.innerHTML = ''; // 清空

    const h = mazeData.length;
    const w = mazeData[0].length;
    const width = w * this.CELL_SIZE;
    const height = h * this.CELL_SIZE;
    world.style.width = `${width}px`;
    world.style.height = `${height}px`;
    world.style.marginLeft = `-${width / 2}px`;
    world.style.marginTop = `-${height / 2}px`;

    let startPos = { x: 0, y: 0 };

    // 1. 路徑處理：全面貪婪合併，移除特殊轉角標記
    let visitedPaths = Array(h).fill(0).map(() => Array(w).fill(false));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mazeData[y][x] > 0 && !visitedPaths[y][x]) {
          let cx = x;
          while (cx < w && mazeData[y][cx] > 0 && !visitedPaths[y][cx]) cx++;
          let blockW = cx - x;

          let blockH = 1;
          let canExpandDown = true;
          while (y + blockH < h && canExpandDown) {
            for (let tx = x; tx < x + blockW; tx++) {
              if (mazeData[y + blockH][tx] <= 0 || visitedPaths[y + blockH][tx]) {
                canExpandDown = false;
                break;
              }
            }
            if (canExpandDown) blockH++;
          }

          for (let ty = y; ty < y + blockH; ty++) {
            for (let tx = x; tx < x + blockW; tx++) {
              visitedPaths[ty][tx] = true;
            }
          }
          this.createBlock(world, x, y, blockW, blockH, 'path');
        }
      }
    }

    // 2. 牆體處理：全面貪婪合併成大型實體區塊
    let visitedWalls = Array(h).fill(0).map(() => Array(w).fill(false));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mazeData[y][x] === 0 && !visitedWalls[y][x]) {
          let cx = x;
          while (cx < w && mazeData[y][cx] === 0 && !visitedWalls[y][cx]) cx++;
          let blockW = cx - x;

          let blockH = 1;
          let canExpandDown = true;
          while (y + blockH < h && canExpandDown) {
            for (let tx = x; tx < x + blockW; tx++) {
              if (mazeData[y + blockH][tx] !== 0 || visitedWalls[y + blockH][tx]) {
                canExpandDown = false;
                break;
              }
            }
            if (canExpandDown) blockH++;
          }

          for (let ty = y; ty < y + blockH; ty++) {
            for (let tx = x; tx < x + blockW; tx++) {
              visitedWalls[ty][tx] = true;
            }
          }
          this.createBlock(world, x, y, blockW, blockH, 'wall');
        }
      }
    }

    // 3. 獨立功能實體疊加：起點、出口、分級能量
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const type = mazeData[y][x];
        if (type === 2) {
          startPos = { x: x * this.CELL_SIZE + this.CELL_SIZE / 2, y: y * this.CELL_SIZE + this.CELL_SIZE / 2 };
          this.createEntity(world, x, y, 'start');
        } else if (type === 3) {
          this.createEntity(world, x, y, 'exit');
        } else if (type === 4 || type === 5) {
          const core = document.createElement('div');
          core.className = type === 4 ? 'light-core-item standard' : 'light-core-item upgraded';
          core.id = `core-${x}-${y}`;
          core.style.left = `${x * this.CELL_SIZE + this.CELL_SIZE / 2}px`;
          core.style.top = `${y * this.CELL_SIZE + this.CELL_SIZE / 2}px`;
          world.appendChild(core);
        } else if (type === 6) {
          // 躲藏凹槽 (視覺上比路徑更深、更窄的凹陷區)
          this.createEntity(world, x, y, 'pocket');
        }
      }
    }

    return startPos;
  },

  createBlock: function(world, x, y, w, h, classes) {
    const block = document.createElement('div');
    block.className = `cell ${classes}`;
    block.style.left = `${x * this.CELL_SIZE}px`;
    block.style.top = `${y * this.CELL_SIZE}px`;
    block.style.width = `${w * this.CELL_SIZE}px`;
    block.style.height = `${h * this.CELL_SIZE}px`;
    world.appendChild(block);
  },

  createEntity: function(world, x, y, typeClass) {
    const entity = document.createElement('div');
    entity.className = `cell entity ${typeClass}`;
    entity.style.left = `${x * this.CELL_SIZE}px`;
    entity.style.top = `${y * this.CELL_SIZE}px`;
    entity.style.width = `${this.CELL_SIZE}px`;
    entity.style.height = `${this.CELL_SIZE}px`;
    world.appendChild(entity);
  }
};
