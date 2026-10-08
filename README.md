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
- 信義街景漫遊（可步行／駕駛消防車）：`dist/xinyi-street.html`，說明見 `HANDOFF-XINYI-STREET-V1.md`。
- 標線核對：`taipei-map.html?place=xinyi&verify=paint`。
- 相鄰外牆：`taipei-map.html?place=xinyi&verify=neighbor`。
- 輪廓對照：`taipei-map.html?place=xinyi&verify=neighbor-outline`。

## 接手與狀態

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
node --no-warnings --experimental-loader ./tests/three-loader.mjs tests/xinyi-aerial.mjs
```

完整測試說明见 `tests/README.md`。API圖資及第三方地圖仍需網路連線。
