# COREO Dark Variant v0.1

本資料夾是 COREO 的深色視覺實驗版，從主線 v2.7 複製而來，只用於手機 A/B 測試。

## 測試目的

- 測試黑鈦展示艙風格是否比明亮版更有遊戲感。
- 測試冷光管線在深色背景下是否更容易看出連續路徑。
- 測試主角冰藍、反派紅光、LIGHT CORE 分級在暗色場景中的辨識度。

## 邊界

- 不取代主線 `APP/`。
- 不新增追逐 AI。
- 不改碰撞邏輯。
- 不改部署主線網址。

## 2026-07-08 色彩更新

套用 Premium Dark Cockpit 配色：曜石深黑 #151517、深石墨路徑 #1C1C1E、鈦金深灰牆體 #2C2C2E、霓虹冷藍主角、亮金能量、霓虹紅反派、霓虹綠出口。玩法與地圖不變。


## 2026-07-09 v0.2 更新

依 GPT 迷宮裁決與 GEM Premium Dark Cockpit 配色更新：地圖同步改為多岔路/短死路/獎勵支線，暗色改為 Deep Space #0A0A0C、Dark Titanium 路徑 #242428、Machined Iron 牆體 #3C3C40，能量採 Volt Yellow / Neon Magenta 分級。

## 2026-07-10 v0.3 更新（Gameplay Layer）

依 GPT「迷宮×追兵×能量」裁決，S 產出、CC 驗證後雙版本同步組裝：
- 迷宮拉長為 7x39，加入 2 條純錯路、1 條誤導型錯路（6格深）、1 條獎勵死路（強化能量）、1 個躲藏凹槽（新 type 6）。
- 新增 `js/enemy.js`：反派巡邏/警戒/追逐三態狀態機，碰到玩家只做震動回饋，不做 Game Over。
- 強化能量新增效果：玩家速度 1.5 倍、反派感應範圍縮小 2.5 秒。
- 本版正式承接 GPT 裁決裡「Gameplay Feeling 優先測試版」定位，玩法邏輯與亮版 `APP/` 完全同步，僅顏色不同（反派狀態光效改用本版 `--coreo-enemy-red` #FF2D55，不沿用亮版色碼）。



## v2.9 / v0.3 CX 補強

- 修正 Sean 測試指出的反派巡邏壓住唯一通道問題：y28 打通中線備用通道，保留反派壓力但允許玩家安全繞行。
- 修正強化能量動畫名稱不一致問題。
- 操控接收區改為較底部的手機安全範圍，降低 Android 手指滑到畫面中段的機率。


## 2026-07-09 v0.3.1 熱修`r`n`r`n- 修正主角被前景牆體遮蔽問題。`r`n- 迷宮延長為 7x47，躲藏點改為短凹槽，路線更接近第一關體感。`r`n- 反派改為慢速笨拙追逐，保留第一關容易度但不再只是上下巡邏。`r`n- 收集 Light Core 時主角放大約 1 秒再縮回。


## 2026-07-09 v0.3.2 熱修

- 修正 v0.3.1 角色 transform 偏移，主角與反派回到路線格中心。
- Light Core 放大效果只在收集時觸發，不再像常駐放大。
- touchmove 改由 document 追蹤，恢復 Android 操控穩定度。

## 2026-07-10 v0.4 第一關規則教學層（S 產出、CC 驗證組裝）

依 GPT「第一關規則教學層」正式裁決：
- 新增 CORE SIGNAL LOST 失敗機制：碰到反派觸發紅光閃現/核心異常閃爍/畫面震動失焦/文字疊層，0.9秒後 `resetLevel()` 乾淨重置關卡（不做死亡/HP、不 reload 頁面）。
- 迷宮改回 7x39 三教學區設計（巡邏區 Hall A/C、埋伏區誤導型錯路、出口前壓力區 Hall G），取代先前 CX 熱修的 7x47 版本，與亮版同步。
- 反派巡邏路線延伸貫串三個教學區。
- CC 組裝時修正 S 原始碼的 `requestAnimationFrame` 迴圈重啟遺漏（否則碰到反派重置一次後遊戲會整個卡死）與追逐邏輯退回成直線逼近的問題（保留原本的笨拙追逐設計）。
- 反派紅光、失敗疊層文字色維持本版自己的 `--coreo-enemy-red`/`--coreo-danger` (#FF2D55)，未沿用亮版色碼。

## 2026-07-09 v0.3.3 角色定位重構（S 產出、CC 驗證組裝）

- 角色 DOM 拆為外層 `.actor`（只管 left/top 與固定 `translateZ(12px)`）+ 內層 `.actor-sprite`（圖片/發光/所有動畫），解決 `translateZ` 在 `rotateX(40deg)` 3D 空間裡造成的視覺偏移根因（偏移量 ≈ Z值×sin(40°)）。
- 收集動畫改為 Type4(1.15倍/500ms)／Type5(1.35倍/800ms)獨立作用在內層，不再被每幀的位置更新覆蓋。
- 反派難度降壓：警戒半徑 250→180、追逐時間 3600→2500ms、追逐速度調整為玩家速度的約57%、碰撞震動冷卻 500→1000ms。
- 反派狀態光效維持本版自己的 `--coreo-enemy-red` #FF2D55，未沿用亮版色碼。
- 迷宮地圖本輪未變動，與亮版同步沿用 CX 先前熱修的 7x47 版本。


## 2026-07-09 v0.3.4 收斂修正

- 依 CC 指令確立 actor 外層定位 / actor-sprite 內層動畫。
- 控制器改用 Pointer Capture 優先，fallback 才使用 touch events。
- 反派第一關降壓，降低感應半徑、追逐時間與追逐速度。
- Light Core 收集放大只作用在內層 sprite，不再影響定位。


## 2026-07-10 v0.5 Premium Dark Cockpit 審閱整合版
- 以本地 DarkVariant v0.4 為基準，審閱 S 的 Premium Dark Cockpit v1.1 產出後定點合併。
- 保留 `maze.js`、`camera.js`、`control.js` 與現有 actor-split 架構，不整包覆蓋。
- 新增 `basic/boost`、`player-collect-basic/player-collect-boost`、`player-signal-lost`、`villain-hunt` 等語意 class，並保留舊 class 相容。
- 將反派調整為較笨拙的短追擊：降低偵測半徑、追擊速度與追擊時間，避免第一關形成過強封鎖。
- CORE SIGNAL LOST 維持無 HP/無 alert，碰撞後顯示疊層並重置關卡。

## 2026-07-10 v0.5.1 可視反派與手感小修
- 修正反派巡邏起點到合法且較容易看見的下段路線，避免 v0.5 看起來像反派消失。
- 主角碰撞半徑由 24 調整為 21，視覺大小不變，只改善左右轉角卡住感。
- 放大吃光源動畫，一般光源與強化光源在手機上更容易看見。
- Service Worker cache 更新為 `coreo-dark-variant-v051-visible-villain-20260710`。

## 2026-07-10 v0.5.3 可視短巡邏與限制尋路追逐
- 反派巡邏範圍回到出生點附近，避免 v0.5.2 全圖巡邏導致玩家看不到反派。
- `enemy.js` 新增限制範圍 BFS 尋路追逐，反派會繞路追玩家，但只搜尋 12 格，不是全知追殺。
- 玩家進入 Type 6 躲藏凹槽或拉開距離時，反派會中斷追逐回巡邏。
- Service Worker cache 更新為 `coreo-dark-variant-v053-pathfinding-chase-20260710`。

## 2026-07-10 v0.5.5 主動路徑追逐與能量增加
- 跳過 v0.5.4，版本更新為 `COREO DARK v0.5.5`。
- 反派巡邏點修正為合法近場 Hall A/B 路線，不再使用超出地圖的 40.5/44.5。
- 反派發現玩家改用路徑距離判定：`pathAlertLimit: 12`，不只靠直線距離。
- 追逐使用 `findPathToPlayer()`，搜尋上限提高到 24 格；短暫失去路徑時保留 1 秒記憶。
- 新增多個一般能量點，讓測試收集與主角放大效果更容易觀察。
- Service Worker cache 更新為 `coreo-dark-variant-v055-active-path-chase-20260710`。

## 2026-07-10 v0.5.6 中段凹洞反派修正
- 修正 v0.5.5 反派離出生點過近，導致主角剛出入口就被封死的問題。
- 反派改放在中段 Hall C 旁的凹洞/側槽附近，主角起步區保持安全。
- 降低路徑觸發門檻與追逐速度，讓反派會追，但不會第一秒堵住入口。
- 保留路徑式追逐，不回退成純定點巡邏。
- Service Worker cache 更新為 `coreo-dark-variant-v056-mid-pocket-chase-20260710`。

## 2026-07-10 v0.5.7 Stage01 路線重規劃
- 維持 7 欄 x 39 列，重做中段迷宮結構，避免牽動 camera / render / CSS 大改。
- 將反派巡邏移到中段左側路線，右側保留繞路線，避免封住唯一通道。
- 新增/保留有效 hide pocket，讓玩家能短暫中斷追逐。
- Boost Core 改為中段風險獎勵，不吃也能通關。
- `enemy.js` 只降壓參數，不重寫追逐系統：降低偵測半徑、路徑觸發距離、追逐速度與追逐時間。
- Service Worker cache 更新為 `coreo-dark-variant-v057-replanned-stage01-20260710`。
