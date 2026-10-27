# EOC 短草試作（2026-10-27）

## 使用者確認

採用第一個 GitHub 方案 three-stylized，草不要太長。本批為小範圍試作，不把前方長條灌木綠籬改成草坪，也不擴張全區綠地。

## 已完成

- 固定 upstream 版本 8eb0dde5a8e7eae985d69f923b627b0cf253bed5，接入真正 GrassLayer 模組及其必要相依；MIT 授權、原 TS 來源、轉換腳本及來源雜湊保留在 repo，並記錄 upstream 對 stylized-components 的致謝。
- 草葉模型高6–12公分、寬1.2–2.4公分，兩節三角葉片；高度是遊戲外觀參數，非現地量測。採輕微風動、自然深淺綠，不加入高草、野花或重建地形。
- 範圍只取現有 GLB 的 EOC_north_park_paths／Sports field 圓形草坪上表面。模型本地中心約 (36,-83.2)，取6.4m內縮半徑，扣除中間園路及其邊界餘裕，再排除車道路幅走廊與實際車道／路口多邊形；草根不落在前方長條綠籬或站點區域。
- 保留原草坪及地坪幾何，不新增碰撞或步行高差。草葉只作視覺覆蓋，人物貼地仍使用原有鋪面。找不到原草坪時不新增草地；載入失敗顯示原草坪。
- 低／中／高品質密度25／55／80葉每平方米、顯示距離35／55／75m，最多12,000葉；單批實例、風動僅改 uniform、不每幀重撒點，不投射／接收草葉陰影。陰影分支由應用程式明確停用，原 shader 來源仍保留。
- 設定內新增短草開關及「地圖標示短草位置」，標記 EOC 北側草坪供前往查看。EOC 模型與道路非同步載入完成後才建草，沿用現有品質設定及太陽光方向。

## 已驗證

實際 EOC GLB 上表面取樣；所有草根在內縮草坪內、避開園路／前方綠籬／道路；高度與最大實例數、品質切換、距離關閉、停止顯示、無每幀重建，以及來源地坪／灌木不變。EOC照片配置與全站YouBike道路檢查通過。

## 尚未驗證與待辦

北側草坪來源是現有場地模型，外框、現地園路及草種仍待照片核對；不要宣稱已測繪的真實草坪。實際遊戲 WebGL shader 畫面、短草遠近外觀、幀率及實體手機待驗收。其他綠地不在本批，自動擴散或前方綠籬改草坪均不允許。

## 來源與重建

[GitHub upstream](https://github.com/Steve245270533/three-stylized)，完整紀錄見 [來源雜湊](sources/three-stylized-provenance-20261027.json)。重建模組：node --no-warnings scripts/build-three-stylized.mjs；測試：node --no-warnings --experimental-loader ./tests/three-loader.mjs tests/xinyi-short-grass.mjs。
