# DriveDocs — Google Apps Script（正式版 · 日期分夾）

此目錄為接 Google Drive / Sheets 的 Web App 原始碼（`.gs` / `.html`）。

## 核心規則

- **Google Drive is the database.** 網站只做介面與索引。
- **客戶文件只依資料日期分夾**：`客戶資料／客戶／{注音}／{姓名}／{yyyy-MM-dd}／`
- **不再使用文件類型分類**（保單／理賠等子資料夾已移除）。
- **Drive 刪夾會同步網站**：開啟或手動「立刻同步 Drive」時，若客戶資料夾已刪／進垃圾桶，Sheets 索引會清除。

## 檔案清單（請整份貼上／覆蓋 Apps Script）

| 檔案 | 說明 |
|------|------|
| `Code.gs` | Web App 入口 |
| `Config.gs` | 常數與版本 |
| `Utils.gs` | Sheets／快取／日期工具 |
| `DriveFolder.gs` | Drive 資料夾層（新建） |
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

版本標記：`v260813r`
