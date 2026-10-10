# Codex 與 Claude 共同編輯

使用者於 2026-10-08 指定本儲存庫為新的共編位置：
https://github.com/YUAN-5149/fire-command-training

## 共同基準與網站

- `main`：雙方整合後的正式原始碼。
- GitHub Pages：https://yuan-5149.github.io/fire-command-training/
- 人物街景：https://yuan-5149.github.io/fire-command-training/xinyi-street.html
- GIS部署：https://yuan-5149.github.io/fire-command-training/taipei-map.html?place=xinyi
- 既有 `.github/workflows/pages.yml` 會對 PR 執行檢查，對 `main` 執行檢查及 Pages 部署。需以 Actions 成功結果確認發布，不能只以 push 成功判定。
- 舊 Sites 保留，不視為自動同步；更新 GitHub 不會自動更新 Sites，反之亦然。使用者後續明確要求更新舊 Sites 時，才同步該網站。

## 每批工作

1. 檢查本機修改，讀取最新遠端 `main` 及目前進度。
2. 在自己的功能分支製作，開始時寫清工作範圍與預計修改檔案；雙方共同改同一檔案時先拆分工作或依序整合。
3. 完成相關檢查，區分程式測試、畫面驗證與現地量測。未取得證據的項目保留待驗證。
4. 推送分支並開 PR；正文包含成果、驗證、限制與下一步，方便另一方接手。
5. 合併前核對最新 `main`，解決差異，不使用強制推送覆蓋共用歷史。合併與發布依使用者授權。
6. 維護 `XINYI-STREETSCENE-PROGRESS.md` 與相關交接紀錄，記載實際版本、修改範圍、已完成／待驗證／待辦。

## 目前接手狀態

基準提交：`831d3ac62a5eff1db6393dc9b1c3724366907706`。
其 [Pages 工作流程](https://github.com/YUAN-5149/fire-command-training/actions/runs/37749575266) 已成功。

已建置：原消防演練、GIS部署、官方建物及 OSM 路網、黃色角色人物漫遊與消防車、GIS人眼近看、84段步行路徑、松智路預設起點。

待驗證：人物長按行走與駕駛手感、實體手機、建物及店面身份、招牌及標線尺寸、網格種類與完整邊界、入口與騎樓高差。人物頁內插地形與簡化碰撞不可當作實測騎樓或完整實體碰撞。

接續順序：微風南山松智路正面 → 相鄰 ATT 建物 → 松智路／松壽路路口 → 核實騎樓與入口連通 → 擴展其他信義街廓。

## 可貼給另一位助理

> 請接續 GitHub YUAN-5149/fire-command-training。先同步最新 main，閱讀 AGENTS.md、COLLABORATION.md、MASTER-SPEC.md 與 XINYI-STREETSCENE-PROGRESS.md。延續原專案，在自己的功能分支修改並以 PR 交接；保留另一位助理已合併的成果。優先製作信義區，未量測項目維持待驗證。
