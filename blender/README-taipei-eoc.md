# 臺北市災害應變中心模型（Blender 程式建模）

莊敬路391巷11弄2號（信義區三張里），臺北市災害應變中心大樓與周邊街廓，
由 `build_taipei_eoc.py` 以 Blender 4.5 程式產生，匯出 glTF（`assets/taipei-eoc.glb`）。

**這是示意模型，不是實測資料。** 建物量體、樓層數、停機坪位置與大小、周邊配置，
都是從 Google 地圖比例尺、Google 地球 3D 鳥瞰與街景（pano `sdqgtREbuiqXtSfjqymmAA`、
`1ZKh73tLCvz-JdIcN25Pxg`）目測估算，未描圖、未使用影像貼圖。
北半部屋頂設備與背面立面沒有清楚參考，為推測。停車場車輛排列為示意。
目前未接入 `dist/` 網站。

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
- 周邊：斜向的391巷11弄與西側大停車場、與423巷7弄交會處黃色網狀線、
  東側圓形噴水池廣場與 YouBike、對街鐵皮加蓋老公寓、信義國中與跑道、世貿新城、台北101

## 座標與可操作節點

- 原點為主體西南角，+X 東、+Y 北（glTF 前方 −Z 為北），單位公尺。
- `EOC building`、`EOC east wing`：extras `kind = eoc`、`floors`，可指定為事件建物。
- `EOC helipad deck`：停機坪面，extras `kind = helipad`、`deck_height`（約 38 m）。
- `EOC helipad edge lights`：邊燈，材質 `Helipad edge light` 的 emissive 打開即亮。
- `EOC windsock`：風向袋，軸心在桅桿上，繞 Z 旋轉即可對應風向。
- `Parked car nn`：停車場車輛，extras `kind = vehicle`。
