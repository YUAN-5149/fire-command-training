# 臺北市災害應變中心模型（Blender 程式建模）

莊敬路391巷11弄2號（信義區三張里），臺北市災害應變中心大樓與周邊街廓，
由 `build_taipei_eoc.py` 以 Blender 4.5 程式產生，匯出 glTF（`assets/taipei-eoc.glb`）。

**這是示意模型，不是實測資料。** 建物量體、樓層數、停機坪位置與大小、周邊配置，
都是從 Google 地圖比例尺、Google 地球 3D 鳥瞰與街景（pano `sdqgtREbuiqXtSfjqymmAA`、
`1ZKh73tLCvz-JdIcN25Pxg`）目測估算，未描圖、未使用影像貼圖。
北半部屋頂設備與背面立面沒有清楚參考，為推測。停車場車輛排列為示意。
網站頁面：`dist/taipei-eoc.html`（首頁「災害應變中心」連結），載入 `dist/assets/taipei-eoc.glb`；重建模型後要把新的 GLB 複製過去。

## 重建

```sh
blender -b -P blender/build_taipei_eoc.py -- --outdir blender
```

輸出 `blender/assets/taipei-eoc.glb`、`blender/preview/taipei-eoc_*.png`、
`blender/blender/taipei-eoc.blend`（.blend 不入版控）。
共用 `build_xinyi_street.py` 的材質與工具函式（該檔現在只在直接執行時才建模）。

## 內容

- 主體 9 層（屋頂約 33 m）＋東側 5 層翼樓，淺灰板材外牆、雙併綠玻璃窗
- 西南角：深色石柱、兩層樓綠色玻璃帷幕、L 型大雨庇；金字名牌
  「臺北市災害應變中心」「臺北市政府地政局土地開發總隊」「臺北市松山地政事務所」
- 南面：通高綠色樓梯玻璃帶、懸挑陽台與百葉牆
- 屋頂南半部：玻璃頂層＋停機坪（綠色面、白框與 H、黃色圓環與角標、紅字 TAIPEI EOC、
  橘色邊燈、斜向安全網），東北角紅白桅桿與風向袋；北半部機房設備
- 地下停車場車道：西側車道往北下坡的雙向坡道（深約 3.8 m），擋土牆、欄杆、車道箭頭與入口限高桿；
  位置依 Google 地球 3D 判讀，坡長與深度為估計
- 周邊：斜向的391巷11弄與西側大停車場、與423巷7弄交會處黃色網狀線、東側圓形噴水池廣場、
  YouBike 與綠地公園；423巷7弄對街與391巷11弄西南側為騎樓街屋（沿用信義街景的街屋產生器，
  含招牌、鐵窗、冷氣、屋頂鐵皮），後排老公寓、世貿新城住宅大樓、三張里活動中心、
  信義國中走廊式校舍與跑道、台北101。周邊建物為示意風格，非逐棟實景

## 座標與可操作節點

- 原點為主體西南角，+X 東、+Y 北（glTF 前方 −Z 為北），單位公尺。
- `EOC building`、`EOC east wing`：extras `kind = eoc`、`floors`，可指定為事件建物。
- `EOC helipad deck`：停機坪面，extras `kind = helipad`、`deck_height`（約 38 m）。
- `EOC helipad edge lights`：邊燈，材質 `Helipad edge light` 的 emissive 打開即亮。
- `EOC windsock`：風向袋，軸心在桅桿上，繞 Z 旋轉即可對應風向。
- `Parked car nn`：停車場車輛，extras `kind = vehicle`。
- `EOC basement ramp`：地下停車場車道，extras `kind = ramp`、`depth`。
- 周邊建物 extras `kind` 為 `apartment`、`shophouse`、`school`，帶 `floors`。

GLB 以 Draco 壓縮匯出（約 2.7 MB）；網站以 `dist/vendor/draco/` 的解碼器載入。

## 臺北真實地圖整合（之後修訂以此為準）

應變中心已放進兩個以官方圖資為底的場景，**之後的修訂以這兩個場景的呈現為準**：

- 臺北真實地圖（`dist/taipei-map.html`，ArcGIS）：側欄「臺北市災害應變中心」可定位、切換精細模型與官方白模
- 信義街景漫遊（`dist/xinyi-street.html`）：選單「前往災害應變中心」，或網址加 `?at=eoc`

定位資料統一放在 `dist/assets/eoc-anchor.json`（地標清單見 `dist/assets/landmarks.json`，消防局用 `hq-anchor.json`）：
- 模型原點（主體西南角）經緯度、方位角、地面高程
- 被精細模型取代、需要隱藏的官方 LOD1 量體編號 `officialIds`

主體尺寸 37.6 × 69.2 m、東翼位置與高度，都依官方量體 264827、263382、264826、263363、264825 擬合。兩個頁面共用 `dist/landmarks-real.js` 載入與擺放模型（應變中心與消防局都用它）。

修訂流程：
1. 改 `build_taipei_eoc.py`，執行建模（會同時產生完整模型與 `taipei-eoc.blend`）
2. 匯出真實地圖用的本體模型（只含建物與自身設施，不含示意的周邊街屋、樹與車）：
   `blender -b blender/taipei-eoc.blend -P blender/export_eoc_core.py -- --outdir <repo>`
3. 把 `assets/taipei-eoc-core.glb`、`assets/taipei-eoc.glb` 複製到 `dist/assets/`
4. 調高 `dist/landmarks-real.js` 裡的 `VERSION`，讓瀏覽器抓到新版
5. 若改了占地或位置，同步更新 `eoc-anchor.json`（`officialIds` 不要漏掉，否則官方白模會和模型重疊）

信義範圍已由北緯 25.0293 往南延伸到 25.0275，納入應變中心周邊：
- 官方建物：`scripts/fetch-lod1.py` 下載（各層級節點都抓，最細的優先；有些建物只存在中間層節點）
- 路網：OSM
- 合併：`scripts/extend-xinyi.py` 只新增範圍外的資料，原有建物與路段不變，因為既有的第一批清單、設施與測試都引用舊編號
- 之後再往北延伸到北緯 25.0425 納入消防局；北側只加消防局周邊 160 m 內的建物，才能維持 `tests/geo-xinyi-detail.mjs` 的 400 萬頂點上限

限制：
- 真實地圖的地面不透明，所以地下停車場車道的下坡段在 ArcGIS 頁看不到，只看得到擋土牆與欄杆
- 完整車道請看模型檢視頁
