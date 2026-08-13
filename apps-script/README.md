# DriveDocs — Google Apps Script（正式版）

此目錄為接 Google Drive / Sheets 的 Web App 原始碼（`.gs` / `.html`）。

## 核心規則

- **Google Drive is the database.** 網站只做介面與索引。
- **畫面依原本規劃**：底欄（首頁／上傳／客戶／活動／設定）、客戶「資料夾總覽」依文件類型分卡、上傳選文件類型、設定可編輯資料夾模板。
- **Drive 路徑**：`客戶資料／客戶／{注音}／{姓名}／{文件類型}／{資料日期}／`
- **Drive 刪夾會同步網站**：開啟客戶詳情或設定「立刻同步 Drive」時，若客戶資料夾已刪／進垃圾桶，Sheets 索引會清除。

## 載入加速（不改畫面）

- 啟動一次 `api_boot`，本機／伺服器快取首頁資料，先畫介面再補資料
- 客戶詳情預設不掃 Drive；點開某一分類才載檔
- 批次上傳重用同一「類型／日期」資料夾
- 新增客戶不預建全部分類夾

## 檔案清單（請整份貼上／覆蓋 Apps Script）

| 檔案 | 說明 |
|------|------|
| `Code.gs` | Web App 入口 |
| `Config.gs` | 常數與版本 |
| `Utils.gs` | Sheets／快取／日期工具 |
| `DriveFolder.gs` | Drive 資料夾層 |
| `DriveService.gs` | 客戶 CRUD |
| `DocumentService.gs` | 上傳／匯入／刪除 |
| `DashboardService.gs` | 首頁／報表 |
| `Setting.gs` | 設定與 `api_*` |
| `BirthdayService.gs` | 本週壽星 |
| `EventService.gs` | 講座／活動 |
| `DemoData.gs` | 示範資料 |
| `Zhuyin.gs` | 注音排序 |
| `Index.html` | 殼層 |
| `Stylesheet.html` | 樣式 |
| `App.html` | 前端邏輯 |

## 部署

```bash
npm install
npx clasp login
# 複製 .clasp.json.example → .clasp.json 並填 scriptId
npx clasp push
```

Apps Script：**部署 → 新增部署 → 網頁應用程式**（或「管理部署」→ 新版本）。

版本標記：`v260813s`
