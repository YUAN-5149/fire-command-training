# 信義區逐車道路面（分階段渲染・第一階段）

用 [osm2streets](https://github.com/a-b-street/osm2streets)（Apache-2.0）把 OSM 道路轉成逐車道的路面：
- 車道、路肩、人行道、自行車道、公車道
- 路口多邊形
- 中線（黃）、車道線、路口前箭頭、停止線

同一份資料 `dist/assets/lanes-xinyi.json` 同時供信義街景漫遊與 Blender 使用。寬度與標線依 OSM 標記推定，非實測。

## 產生資料

```sh
npm i --no-save osm2streets-js@0.1.4
node scripts/build-lanes.mjs <xinyi-osm.xml>
```

OSM 檔與 `scripts/build-streets.py` 同範圍，從 `https://api.openstreetmap.org/api/0.6/map?bbox=121.5604,25.0275,121.5704,25.0425` 下載。

腳本對 osm2streets 的原始輸出做了三項整理：
- 箭頭：只留路口前 14–24 m、每車道約一個。原始輸出沿每條車道每隔數公尺一個，全區約 6 萬個
- 路口內的中線、車道線、箭頭全部去掉
- 斜穿路口的人行步道多邊形（OSM 的 footway=crossing）去掉，路口內的行人穿越改由斑馬線呈現

## 街景漫遊

- `dist/xinyi-lanes.js` 依地面高程貼地，每種材質合併成一個網格
- 預設使用逐車道路面；網址加 `?roads=legacy` 可切回原本依 OSM 寬度展開的示意路面

## Blender

```sh
blender -b -P blender/build_xinyi_lanes.py -- --repo <repo>                          # 整區
blender -b -P blender/build_xinyi_lanes.py -- --repo <repo> --center 121.5687,25.0411 --radius 250   # 分區
```

輸出：
- `assets/xinyi-lanes.glb`（Draco，約 0.2 MB）
- `preview/xinyi-lanes_*.png`：整區、消防局路口、應變中心

路面平鋪、不含地形起伏；人行道高 0.1 m 表現路緣。
