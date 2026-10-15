# 信義區街景模型（Blender 程式建模）

松仁路 × 忠孝東路五段口，臺北市政府消防局（松仁路1號）周邊約 150 m × 150 m，
由 `build_xinyi_street.py` 以 Blender 4.5 程式產生，匯出 glTF（`assets/xinyi-street.glb`）。

**這是示意模型，不是實測資料。** 道路寬度、建物量體、樓層數、設施位置都是從 Google 地圖
比例尺與街景目測估算（參考街景 pano `4zIyhQYMorzdcPpXP0F9Cw`、`1KP1sE0eaTdTXJhZTZWxuQ`，
2025-01），未描圖、未使用街景影像貼圖。店招一律為通用行業名稱，非真實店家。
目前未接入 `dist/` 網站，也不會被 GitHub Pages 部署。

## 重建

```sh
blender -b -P blender/build_xinyi_street.py -- --stage 4 --outdir blender
```

`--stage N` 只建到第 N 階段（每階段包含之前所有內容），輸出：
`blender/assets/xinyi-street.glb`、`blender/preview/xinyi-street_sN_*.png`、
`blender/blender/xinyi-street.blend`（.blend 不入版控）。

| 階段 | 內容 |
|---|---|
| 1 | 路網：車道、人行道、紅線、分隔島、標線、斑馬線、機車停等區 |
| 2 | 消防局：花崗岩基座、玻璃帶塔樓、兩處雨庇門廊、忠孝路側 3 個車道 |
| 3 | 忠孝路北側騎樓店屋（每棟獨立物件）、西北角辦公大樓 |
| 4 | 行道樹與棕櫚、號誌、路燈、電箱、忠孝路分隔護欄、消防局前黃色網狀線 |
| 5 | 背景高樓與燈光（未完成） |

## 座標與可操作節點

- 原點為松仁路／忠孝東路路口中心，+X 東、+Y 北（glTF 前方 −Z 為北），單位公尺。
- `Apparatus bay shutter 1–3`：鐵捲門，模型為「已捲起」狀態，Z 方向移動 −4.6 m 即關閉。
- `Signal NB/SB/EB/WB red|yellow|green`：號誌燈面，切換材質
  `Signal <color> on` / `Signal <color> off` 改變燈號。
- `Shophouse NE nn`、`Shophouse NW nn`、`Office NW corner`：每棟建物一個物件，
  extras 帶 `kind`、`floors`，可指定為火災建物。
- `Utility cabinets HQ corner`、`Utility box Songren`：extras `kind = electrical`。

## 待驗證

道路與標線實際尺寸、分隔護欄在消防局前是否有開口、樹木與設施實際位置、消防栓位置
（未建，需實際資料）。
