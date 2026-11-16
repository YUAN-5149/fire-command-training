# 排煙車「劍潭76」模型（2026-11-16）

新增臺北市政府消防局 76 排煙車 3D 模型，接入**消防演練首頁（富錦街）**與**信義街景漫遊**。
既有車輛、車組、雲梯與分隊流程不變；排煙車不屬於四個車組。

## 模型與容量

- `dist/assets/smoke-truck.glb`：**0.89 MB**（Blender 原始匯出 7.9 MB）。車頭朝 -X、公尺、輪胎底在 0，與水庫車、勤務車同慣例。
- 網頁版的處理（`blender/smoke-truck/export_web.py` + gltfpack 0.24）：
  1. 同一個 rig 節點下的零件合併為一個網格（每種材質一個 primitive）：708 個網格 → 24 個，繪製呼叫大幅減少；
     紅色警示燈罩（左右交替閃爍）與舉升油壓缸兩節保持獨立。
  2. `gltfpack -kn -km -cc -si 0.6 -se 0.002`：保留具名節點與材質，頂點量化（KHR_mesh_quantization）、
     meshopt 壓縮（EXT_meshopt_compression），簡化誤差上限 0.2%；外廓與原檔相同（7.437 × 3.080 × 3.230 m，含後視鏡與收納的排煙機）。
- 解碼器 `dist/vendor/jsm/libs/meshopt_decoder.module.js`（three.js r186 附帶，MIT，約 29 KB、內含 wasm），只有載入排煙車時才下載。
- 骨架節點：`Vehicle`、`Wheel spin F L/R`、`Wheel spin R L/R inner/outer`（後輪雙胎）、
  `Fan slew` → `Fan boom lift` → `Fan boom extend` → `Fan tilt` → `Fan rotor`、`Lift ram anchor/eye/barrel/rod`；
  紅色燈罩材質 `Red beacon lens`（與水庫車、勤務車相同）。
- 原始腳本在 `blender/smoke-truck/`（`build_smoke_truck.py` 建模與算圖、`export_glb.py` 完整匯出、`export_web.py` 網頁版、
  `animate_smoke.py` 動畫），照片對照與避坑紀錄見該資料夾 README。車牌虛構。

## 排煙機 rig（`dist/imported-smoke-truck.js` 的 `rigSmokeFan`）

- `set(u, slew)`：u 0 收納 → 1 展開。前 60% 起臂 65° 並同時調平排煙機（出風口下俯約 20°），60–80% 伸臂 0.55 m，80–100% 旋轉到 slew。
- 舉升油壓缸兩節每次都重新對準兩端銷（glTF 沒有 Damped Track），起臂時由 0.723 m 伸到 1.129 m，與 Blender 原檔一致。
- `spinUp(dt, level)`：葉輪轉動（畫面示意轉速 400 rpm，實機更快，逐幀取樣會閃爍）。

## 消防演練首頁（`index.html` → `app.js`）

- 不等排煙車載完才開場：其他車輛照舊，排煙車背景載入後才加入場景與警示燈閃爍；載入失敗時略過。
- `dist/staging.js`：`smokeTruckStaging = {x:-33, z:14.6, heading:π/2}`。原車道已沒有 7.4 m 的空位，停在對向側車道西段、順向，
  佔 x -36.7..-29.3、z 13.4..15.8，在道路範圍（x ±45、z 4.5..17.5）內，不占雲梯作業區。
- `index.html` 的 `app.js` 版本改為 `?v=smoke-20261116`。

## 信義街景漫遊（`xinyi-street.html` → `xinyi-street.js`）

- `dist/xinyi-street-smoke-truck.js`：`SMOKE_TRUCK` 參數與 `createSmokeTruck`，沿用水庫車的出勤、行駛、停車與避讓邏輯（`createTanker` 的 spec）。
  派遣火警後出勤準備 40 秒，自信義分隊車庫前出口出車（示意；實際由劍潭分隊支援），停在火場 15–50 m 的車道（順向）；
  停妥後 14 秒內展開排煙機並轉向火場，再 5 秒葉輪到全速。不載水、不補水。
- `xinyi-street.js` 接線：背景載入（失敗不影響其他功能）；派遣（排在勤務車之後、水庫車之前選停車點）、結束任務收回排煙機、
  碰撞圓與其他支援車的停等障礙；分隊指揮面板（B）增加排煙車狀態列（出勤準備／行駛中／展開排煙機／送風排煙中）；任務紀錄 JSON 增加 `smokeTruck`。
- `xinyi-street.html` 的 `xinyi-street.js` 版本改為 `?v=s69-smoke-20261116`。

## 測試

- `tests/smoke-truck.mjs`（加入 CI）：檔案 < 1.2 MB、壓縮擴充、網格數 ≤ 30、rig 節點與警示燈材質；
  以 meshopt 實際解碼後檢查外廓；展開時油壓缸兩節對準兩端銷且伸長、排煙機升高、出風口俯角 20°、旋轉 90° 後朝車側、收回後回到原位；
  首頁停放位置不與車組、水庫車、勤務車、雲梯作業區重疊；方格路網上出勤 → 行駛 → 停妥 → 展開 → 送風，不補水，結束任務後收回。

## 限制

- 照片上由地面接到排煙機頭的白色水帶未建模；霧化水霧只在 Blender 動畫中，網頁版沒有。
- 出勤時間、車速、停車點、展開時間皆為示意，不是實際派遣規定或車輛性能。
