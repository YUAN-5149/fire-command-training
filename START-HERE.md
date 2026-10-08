# 消防訓練場景：跨對話移交

匯出日期：2026-10-01（臺灣時間）。本文件及壓縮包是此時的快照；網站若已有後續修改，須先讀取現有 Sites 原始碼再比對，不可用快照覆蓋較新版本。

## 新對話啟動指令（可整段貼上）

我要接續「消防訓練場景」專案。請先閱讀附件內的 START-HERE.md 與 MASTER-SPEC.md，再讀取現有網站原始碼。這是修改原有網站，不是新建網站。

原網站：https://fire-command-training.d086110.chatgpt.site/
西門：https://fire-command-training.d086110.chatgpt.site/taipei-map.html?place=ximen
信義：https://fire-command-training.d086110.chatgpt.site/taipei-map.html?place=xinyi

沿用 MASTER SPEC V1.0 及最小變更原則。真實道路、建物位置與比例不可任意重做；消防車維持既有車型、紅色警示燈、順向部署及合理支腿作業空間。自動透視功能已取消，不得自行恢復。

我希望街區視覺接近 https://taipei-gta.vercel.app/ ，但目前並未取得或套用該網站的地圖、程式或素材。不可把目前示意外觀說成實景外觀，也不可把該遊戲的壓縮地圖視為實測街道。

請先確認附件及現有專案能否讀取，簡短說明接手狀態；不要重新要求我提供文件內已有的資料。此次先接手，不自動改版。我的下一項修改要求會另行提供。

## 原網站識別與版本

- Sites project_id：`appgprj_6aa17dc83edc8191a63823a091fa8cb5`
- 最後確認發布成功：2026-09-30 17:40 左右（臺灣時間）。
- 原始碼 commit：`0a4ce6503503e3e9b03b8a30ec04625357bd1bbd`
- 已發布 version_id：`appgprj_6aa17dc83edc8191a63823a091fa8cb5~appgver_49b80f77d2908191893763aa9fa6b104`
- 已發布 deployment_id：`appgdep_6abcd8f0f8448191b8d543295a3bfa43`
- 存取設定：最後核對為使用者 owner、custom、僅擁有者。繼續保留原分享範圍。
- `.openai/hosting.json` 已包含 project_id 與 `static.directory: dist`。不得呼叫 create_site 新建替代網站。
- 歷史 MASTER SPEC 的基準圖片版本是 V08；這不是現行網站的版本號。不要把今天的網站任意稱為 V09 或 V08。
- 先前對話曾稱 V09 圖片已完成／已儲存，但本移交包沒有可確認的該圖片。不可把該說法當成已驗證成果。

## 包內結構與恢復方法

- `project/`：git 追蹤的完整原始碼快照、dist 網站、GLB 模型、參考照片、圖資衍生資料、scripts、tests、套件鎖檔。
- `gis-source/`：重建圖資衍生檔所需的官方 I3S 快取、OSM XML 與下載／檢視腳本（若另列為補充包，請解壓到相同層級）。
- `references/`：使用者提供的目標選取、街景與白模問題截圖。目標街景也位於 project/dist/assets/target-street-reference.png。
- `MASTER-SPEC.md`：原 MASTER SPEC V1.0 的忠實整理及後续已確認決策；非原文逐字轉錄。
- `FILES-SHA256.txt`：包內檔案校驗表。

新對話不要依賴舊 scratch 路徑仍存在。優先依 project_id 透過 Sites 技能開啟既有原始碼。若無 Sites 存取權，可先用附件恢復本機內容，但不可聲稱已更新網站。

恢復時保留原專案，先比對版本再修改；憑證需重新取得。本包不含登入 token、cookie、Git 認證、node_modules 或 .git。

原專案為 plain static 網站，已完成的網站直接位於 dist；不是 React 專案，也沒有 npm build 腳本。預覽可用 npm ci 後 npm run dev，發布依 Sites 技能指定的既有專案工作流程。勿直接將整個原始碼資料夾当作部署輸出。

## 已有功能：兩個不同頁面，不可混淆

### A. 原消防訓練首頁 `/`

Three.js 消防演練場景，保留富錦街風貌重建、消防車／救護車／雲梯車 GLB、指揮人員、火煙、任務與紀錄、患者、搜索、步行及雲梯機械動作等模組。

既有程式含雲梯支腿、轉台與車體碰撞、籃架微角度轉向、砲塔原點出水／大水霧與接人下降相關實作。這些曾有回歸檢查，但不代表所有互動都已通過真人或瀏覽器視覺驗證。詳細行為見 tests/README.md。

舊首頁的街景是風貌重建，並非現地測繪。不要將其與下述真實 GIS 頁面的精度混為一談。

### B. 真實圖資頁 `taipei-map.html`

- ArcGIS Maps SDK for JavaScript 4.33，SceneView。
- 官方建物來源：`https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2024/SceneServer/layers/0`
- 為臺北市都發局 113 年（2024）LOD1 建物積木模型。原始模型無逐棟實景外牆貼圖。
- 座標 WGS84（EPSG:4326）；來源垂直座標 EGM96、高程以公尺計。不得混用車輛本地座標與經緯度。
- 原生欄位：OBJECTID、BUILD_RE（屋頂高程）、BUILD_GE（出入口高程）、Label、H、BuildType。
- 道路底圖 OpenStreetMap；地形 world-elevation。
- 可切富錦、信義、西門；GIS 消防部署目前只對信義、西門啟用。
- 可選搶救建物、標記第一正面入口、放置既有車型及各車組人員、調整朝向、記錄命令、下載 JSON。
- 各區部署只保留本次頁面開啟期間，重新整理會消失；沒有完整持久化／重新匯入功能。
- GIS 頁面的命令是紀錄，不會自動執行滅火、搜索、行車。雲梯維持收梯待命，尚未將原首頁全部救援動作移植過來。
- 碰撞檢查：車組預留矩形及視角下可見建物的取樣檢查。不是完整實體碰撞或消防安全認證。
- 雲梯橙框為模型作業預留範圍，不是原廠支腿包絡或核定作業半徑。

### 已加入的街道／建築視覺

- 西門 557 段、信義 616 段 OSM 道路／人行路徑。使用真實座標、沒有重畫虛構街道。
- 這批西門道路沒有 width 標記，信義僅 8 段有 width；其他寬度依車道數或類型估算，介面標示示意寬度，不能據此量測支腿空間。
- 路面和人行道高差為示意；沒有隨意添加未經核對的斑馬線、车道標線。橋梁、地下、室內路徑排除地面渲染。
- 可選街道「沿街近看」及沿路前移／後移，這是相機沿路移動，不是自由步行角色系統。
- 最新整區示意外觀：西門 4,236 個、信義 1,713 個官方建物量體，數量不是實際棟數，單棟可能含多個量體。
- 葉節點幾何提取真實矩形牆面與屋頂三角形，加上示意窗格、牆面與屋頂配色；其他遠處建物用 H 分級配色。
- 西門界框：[121.5025,25.0375,121.5125,25.0465]；信義：[121.5604,25.0293,121.5704,25.0383]。
- 建物外觀是參考遊戲的示意風格，不是台北 GTA 原素材，也不是照片級或逐棟實景。視覺窗格不能當作實際救援開口／樓層數。
- 原始官方建物未移除；外觀為貼合原幾何的 Mesh 圖層，開關可回到原始白模。

## 使用者指定的搶救目標

- 位置：西寧南路 123–127 號的阿曼 TiT 一帶；名稱經地址搜尋及 OSM 建物核對。
- 精確選取的是官方 OBJECTID `17697`；Label `32R`。
- 選定量體 H = 74.62999725341797 m；BUILD_GE = 4.28 m；BUILD_RE = 78.91 m。
- 74.63 m 只代表選定量體，不能當作整棟塔樓總高度；32R 不直接推定為 32 層。
- 量體中心：約 121.50674032195339, 25.04446642558969。
- 臨西寧南路正面寬约 35.49499 m、高約 74.63 m；從官方節點 184 的 feature 17697 幾何驗證。
- 正面兩端（lon,lat,z）：[121.50650693635598,25.044308573825674,4.2800033]；[121.50660246548934,25.0446175300785,4.2800033]。
- 使用者街景截圖顯示 2025 年 5 月，畫面為深灰低樓層、玻璃帷幕、水平窗帶、退縮塔樓。
- `geo-target.js` 個別正面以照片作視覺參考，仍為近似窗格與材質，沒有實測樓層／開口尺寸。新增面層離原面最多 0.18 m。
- 「看搶救目標正面」「設為本區搶救目標」與原圖對照已加入。
- 第一正面入口精確點仍須使用者指定；不得把某個店面鐵捲門自動當成消防主入口。
- 全區外觀已刻意跳過 17697 的主要西向正面，以保留此單獨照片參考外觀。

## 檔案導航

- dist/taipei-map.js/html/css：GIS 主頁、載入與地點切換。
- dist/geo-deployment.js：GIS 車組、人員、入口、命令與基本避碰。
- dist/geo-streets.js：路面、人行路徑、沿街相機。
- dist/geo-target.js：單一目標正面、定位與 preset target。
- dist/geo-district.js：整區窗格、屋頂、牆面及原白模開關。
- dist/assets/ximen-target.json：已核對目標位置與正面。
- dist/assets/district-ximen.json / district-xinyi.json：從官方葉節點提取的牆面與屋頂。
- dist/assets/streets-ximen.json / streets-xinyi.json：OSM 道路幾何、來源與寬度標示。
- dist/assets/geo-models.json、geo-*.glb：GIS 版本車輛及制服模型，保留原車型及紅燈。
- dist/app.js 與 dist/*aerial*.js：原 Three.js 演練主控及雲梯邏輯。勿將 GIS 改動直接替代原演練。
- scripts/build-district-facades.py：提取官方葉節點矩形立面與屋頂；拒絕用矩形填平非矩形空隙。
- scripts/build-target-facade.py：精確提取 17697 正面。
- scripts/build-streets.py：從 OSM XML 提取路網。西門原 XML 尾端 relations 曾截斷；腳本只在 nodes/ways 均完整、已進入 relations 後允許忽略該尾段，未使用 relations。
- scripts/build-geo-models.mjs：由原模型產生 GIS 資產，需 tests/three-loader.mjs 處理 three import。

## 檢查與限制

在 project 根目錄執行：

```sh
node --check dist/taipei-map.js
node --check dist/geo-deployment.js
node --check dist/geo-district.js
node tests/geo-deployment.mjs
node tests/geo-streets.mjs
node tests/geo-target.mjs
node tests/geo-district.mjs
```

這些檢查曾通過：經緯度界框、公尺換算、車組旋轉交疊、GLB 格式與尺寸、目標面邊界、窗格索引、官方法向量、保留目標正面及幾何記憶體上限。

最新整區幾何：西門 2,715,614 頂點／1,339,576 三角形；信義 2,157,640 頂點／1,068,542 三角形。需留意手機效能；不是已通過各裝置效能測試。

先前工具瀏覽器無法初始化 WebGL，未完成瀏覽器內 3D 畫面驗證。使用者曾回傳目標窗格顯示截圖，但最新整區渲染尚無使用者確認。不可聲稱已全面視覺 QA、已確認所有車輛動作正常或已達照片級效果。

## 參考網站與下一步

參考：https://taipei-gta.vercel.app/

曾讀取公開前端供研究，資料標示過 taipei-compressed-v1、臺北壓縮原型、legacy-compressed。沒有核實可移植的公開儲存庫、地圖下載包或重用授權。公開可玩不等於已取得整套地圖可重用權利。該網站可能後續更新，不能將舊研究當成其現況保證。本包未收錄其程式或素材。

使用者最後問如何製作相似場景；助理建議：官方定位 → Blender 詳細立面／店面／騎樓與街道 → GLB → 網站整合碰撞、部署與救援。先精修阿曼 TiT 西寧南路正面及前方約 100 公尺，再擴展。這是建議，尚未製作完成；本次只匯出移交，不自動展開下一階段。

後續精修所缺：平視門口照、左右斜角照、對街道路參考及入口位置。已有照片可繼續利用，不應要求使用者重給。新增細節要區分實證與示意，不能以視覺效果取代消防機械和部署合理性。
