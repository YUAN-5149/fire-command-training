# 消防訓練場景 / Fire Command Training

第70版來源備份，延續原網站：https://fire-command-training.d086110.chatgpt.site/

來源提交：`2dbcc63dbaf54627cdda3683970fa8e175ae8c2e`（2026-10-08）。

## 啟動

安裝 Node.js 後，在此資料夾執行：

```sh
npm ci
npm run dev
```

網站輸出位於 `dist/`，本專案為靜態 HTML / JavaScript，不需要另做 npm build。

- 消防演練首頁：`dist/index.html`。
- 臺北GIS與部署：`dist/taipei-map.html?place=xinyi`。
- 信義街景漫遊（可步行／駕駛消防車、消防任務、雲梯車升梯作業，可開啟 GIS 頁的部署；支援鍵盤、觸控與遊戲手把）：`dist/xinyi-street.html`，說明見 `HANDOFF-XINYI-STREET-V1.md`。
- 標線核對：`taipei-map.html?place=xinyi&verify=paint`。
- 相鄰外牆：`taipei-map.html?place=xinyi&verify=neighbor`。
- 輪廓對照：`taipei-map.html?place=xinyi&verify=neighbor-outline`。

## 接手與狀態

持續決策與跨工具記憶見 [PROJECT-MEMORY.md](PROJECT-MEMORY.md)。後續街道精修一併依其中植栽規則建置；EOC 前方長條已確認為灌木叢，整段新版替換仍列待辦。

請先讀 `MASTER-SPEC.md`、`START-HERE.md` 與 `HANDOFF-XINYI-BATCH15.md`。START-HERE是原移交快照；後續批次紀錄及現有原始碼是目前實作。

保留既有車型、红色警示燈、車組及官方建物位置；不自動透視，也不為配置車輛任意拓寬道路。

已製作相鄰三段外牆、輪廓比對線、雙黃線、停止線、箭頭、停等框及斜向網格核對樣板。精確標線尺寸、網格種類與完整邊界、建物身份與門口、騎樓兩段高差仍待驗證；樣板值不能視為實測資料。

原部署仍使用 Sites；`.openai/hosting.json` 保留同一專案識別。

## GitHub Pages 自動部署

`.github/workflows/pages.yml`：推送到 `main` 時先執行 JS 語法檢查與 GIS 回歸測試，通過後把 `dist/` 部署到 GitHub Pages；PR 及其他分支只跑檢查不部署，也可在 Actions 頁手動執行。

首次需在 GitHub 儲存庫 Settings → Pages → Build and deployment → Source 選「GitHub Actions」。網址為 `https://yuan-5149.github.io/fire-command-training/`，GIS 頁為 `taipei-map.html?place=xinyi`。Pages 網站預設公開，與 Sites 的僅擁有者分享範圍不同。

## 驗證

```sh
node tests/geo-field-review.mjs
node tests/geo-xinyi-detail.mjs
node tests/xinyi-street.mjs
node --no-warnings --experimental-loader ./tests/three-loader.mjs tests/wheel-rig.mjs
node --no-warnings --experimental-loader ./tests/three-loader.mjs tests/xinyi-street-life.mjs
node tests/xinyi-street-nav.mjs
node --no-warnings --experimental-loader ./tests/three-loader.mjs tests/xinyi-street-mission.mjs
node tests/xinyi-street-gamepad.mjs
node --no-warnings --experimental-loader ./tests/three-loader.mjs tests/xinyi-street-aerial.mjs
node --no-warnings --experimental-loader ./tests/three-loader.mjs tests/xinyi-street-gis.mjs
```

完整測試說明见 `tests/README.md`。API圖資及第三方地圖仍需網路連線。

## 信義區全區道路（2026-10-23）

道路與官方紅黃線已擴至信義區行政界；原核心精修量體與設定保留。全區路網3950段、紅線10519段、黃線730段、OSM明確斑馬線100段。官方紅黃線採2024-07-12圖資，現況及尺寸待核對；原核心車道線仍為推估，黃虛線缺定位資料，外圍地形不是實測DEM。完整來源、重建與待辦見[本批紀錄](docs/xinyi-roads-20261023.md)。

### 黑白人行穿越道

新增白色條紋與深色路面交錯；100段OSM斑馬線與553段條紋待核對的穿越道分開控制。明確無標線路段不套用。位置沿原路徑，尺寸為示意，詳見[黑白穿越道紀錄](docs/xinyi-zebra-20261023.md)。

### 黃色網狀線影像盤點

完成全區71幅2025官方航照道路初篩、全部1,648筆候選人工分類，去重後匯入183個可辨識外框；247筆候選另待釐清。未偵測或遮蔽標線可能漏辨，線寬、間距與2026現況仍待驗證，詳見[本批紀錄](docs/xinyi-yellow-boxes-20261023.md)。

### 動態移動流暢度

減少小地圖重畫與全車配對比對，遠處角色骨架分級更新；主角及近處角色逐幀更新、原移動速度保留。自動畫質降低高DPI負擔，手動設定保留。測試與實機驗證限制見[調整紀錄](docs/xinyi-runtime-20261023.md)。

### 汽機車外觀

延續既有slop GitHub汽車，細修圓潤車體及輪圈；方塊機車改為踏板車與坐姿騎士，加入轉動輪胎及車燈。116輛車仍使用5組批次繪製。來源、測試與實機待驗證項目見[外觀細修紀錄](docs/xinyi-traffic-detail-20261023.md)。

### 示意公車

接入原引用倉庫的低地板公車模型，最多4輛，與原116輛汽機車共用密度控制。公車沿較寬幹道路段試行，標示示意車流；沒有合適直行銜接時停等，未套用真實路線或時刻。來源與驗證見[公車接入紀錄](docs/xinyi-bus-20261023.md)。

### 應變中心停車場

信義街景內133輛方塊停放車改為圓潤轎車／休旅，保留車位、車色、方向及貼地高度；近遠模型合併為最多4組繪製，停放車輛保持熄燈。原GLB與GIS模型未改，詳見[停車場修飾紀錄](docs/eoc-parking-20261023.md)。

### 水庫車「信義61」

新增12噸三軸水庫車（Blender自製GLB，車頭依實車照片）。消防演練首頁停在第二車組後方同車道順向；信義街景派遣火警後自信義分隊出勤、到場後於80 m內自動補水給中隊長水箱車（示意每秒30 L）。分隊指揮面板可看狀態。詳見[水庫車接入紀錄](docs/water-tanker-20261024.md)。

### 消防局 Outlander 勤務車

新增臺北市消防局三菱Outlander勤務車3D模型（Blender自製GLB，依實車照片，第三代小改款；約4.69 × 2.10 × 1.86 m）：金屬紅車身、車頂短型紅色LED警示燈、前門「臺北市政府消防局／徽章／消防警備車」、捐贈字樣。消防演練首頁停在第四車組前方同車道順向；信義街景派遣火警後自信義分隊出勤、到場順向停車作為指揮據點，分隊指揮面板可看狀態。詳見[模型紀錄](docs/survey-car-20261025.md)與`blender/survey-car/README.md`。
