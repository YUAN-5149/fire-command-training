# 信義區第二階段：逐棟建物立面＋全區街道設施

第一階段（車道）見 `README-xinyi-lanes.md`。本階段讓信義區**每一棟**官方 LOD1 量體都有自己的外觀，
並把路燈、路樹、號誌、消防栓、公車亭、草地鋪滿全區。網頁（街景漫遊）與 Blender 共用同一份規則。

## 資料

| 檔案 | 產生方式 | 內容 |
|---|---|---|
| `dist/assets/building-styles-xinyi.json` | `python scripts/build-building-styles.py <xinyi-osm.xml>` | 每棟 `[外觀分類, 樓層, 一樓店面, 立面色]` |
| `dist/assets/street-furniture-xinyi.json` | `python scripts/build-street-furniture.py <xinyi-osm.xml> <TaipeiLight.json>` | 路燈、路樹、號誌、消防栓、公車亭、草地（本地公尺） |

- 外觀分類：0 老公寓（鐵窗）、1 住宅大樓、2 高層住宅、3 辦公商業（玻璃帷幕）、4 學校公共、5 寺廟、6 雨遮棚架。
  OSM 有的建物用 OSM 的 `building`、`building:levels`、`building:colour`；沒有的依高度與占地推定。
  一樓店面看 OSM 店家 POI 是否落在量體內或 7 m 內。
- 路燈：[臺北市路燈](https://data.taipei/dataset/detail?id=262e80cf-579c-4bfb-ba73-31621bc84616)
  `TaipeiLight.json`（TWD97），腳本內建 TM2 反算，並以倉庫既有路燈經緯度驗證（誤差 < 5 cm 才寫出）。
- 號誌桿位移到最近人行道邊，懸臂伸向 OSM 號誌點；公車亭背對最近車道。

## 街景漫遊

- `dist/xinyi-facades.js`：中心 250 m 外的建物每面牆只用一個四邊形，窗格、樓板線、陽台、鐵窗、
  一樓騎樓店面與店招帶由著色器依外觀分類畫出（約 13.5 萬頂點，取代舊的逐窗網格約 190 萬頂點）；
  冷氣、鐵窗格柵、水塔、頂樓加蓋、臨街直立招牌用 InstancedMesh。夜間窗戶隨機亮燈、招牌依各自顏色發光。
- `dist/xinyi-furniture.js`：全區路燈 4,078 支（原本只有中心 188 支）、路樹、號誌（桿＋懸臂＋三燈）、
  消防栓（地上式紅色、地下式黃色標線）、公車亭、草地公園。
- 回到舊外觀：網址加 `?facades=legacy`（建物）；設施檔載入失敗時自動用原本的中心 250 m 設施。

## Blender

    node scripts/export-scene-props.mjs <props.json>
    blender -b -P blender/build_xinyi_district.py -- --repo <repo> --props <props.json> [--center LON,LAT --radius M]

- `export-scene-props.mjs` 用網頁同一份模組輸出建物與所有小物件，Blender 端不重寫規則。
- 立面材質用節點畫窗格：UV（公尺）配上每面的 `floorh`、`shop` 屬性。
- 輸出 `blender/assets/xinyi-district.glb`（Draco，約 3 MB）、`blender/preview/xinyi-district_*.png`；
  `blender/xinyi-district.blend` 約 60 MB，不放進倉庫，需要時重跑。整區建置＋四張渲染約 7 分鐘。

## 限制

外觀分類、樓層、店面都是推定的示意外觀，**窗戶不是實際救援開口**，不可據此判斷救災作業；
消防栓位置以 OSM 為準，實際以消防局水源資料為準。
