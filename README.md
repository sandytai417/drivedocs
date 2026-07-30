# DriveDocs

**Organize Client Documents Directly in Google Drive.**

DriveDocs 是一套建立在 Google Drive 之上的客戶文件管理系統 Demo。  
它不建立另一套檔案系統——**Google Drive is the database. DriveDocs is the interface.**

適合保險業務、財務顧問、房仲、代書、會計／法律事務所與中小企業行政，用更好的管理介面完成：

- 新增客戶並自動建立 Drive 資料夾樹
- 注音排序的客戶瀏覽（接近檔案總管，而非 Excel）
- 文件上傳直寫 Google Drive（網站不保存副本）
- 文件完成度、Dashboard、搜尋與每日整理報表

---

## 架構

```
Browser
  ↓
Google Apps Script Web App
  ↓
Google Drive API        Google Sheets
├── 客戶資料/           ├── Customers（索引）
│   └── 王大明/         ├── Settings
│       ├── 01 基本資料 ├── Activity
│       ├── 02 保單     └── Reports
│       ├── …
│       └── metadata.json
```

| Layer | Technology |
| --- | --- |
| Frontend | HTML + CSS + JavaScript（Apps Script HTML Service） |
| Backend | Google Apps Script (V8) |
| Storage | Google Drive |
| Index | Google Sheets |
| Auth | Google OAuth（Web App 部署身分） |
| Deploy | Apps Script Web App + clasp |

---

## 專案結構

```
src/
  appsscript.json      # GAS 專案設定與 OAuth scopes
  Code.js              # doGet / include
  Config.js            # 常數與 Script Properties
  SheetService.js      # Sheets 索引
  DriveService.js      # Drive 資料夾／上傳
  CustomerService.js   # 客戶 CRUD、搜尋
  DocumentService.js   # 文件上傳／刪除
  DashboardService.js  # Dashboard、報表
  SettingsService.js   # 初始化與設定 API
  Zhuyin.js            # 教育部注音排序
  DemoData.js          # 示範客戶種子資料
  Index.html           # SPA 殼層
  Stylesheet.html      # 樣式
  App.html             # 前端邏輯
```

---

## 快速開始

### 1. 前置需求

- Node.js 18+
- Google 帳號（建議 Google Workspace）
- [clasp](https://github.com/google/clasp) CLI

```bash
npm install
npx clasp login
```

### 2. 建立 Apps Script 專案

```bash
npx clasp create --title "DriveDocs" --type webapp --rootDir src
# 或複製 .clasp.json.example → .clasp.json 並填入既有 scriptId
npx clasp push
npx clasp open
```

### 3. 部署 Web App

在 Apps Script 編輯器：

1. **部署 → 新增部署 → 類型：網頁應用程式**
2. 執行身分：我
3. 具有存取權的使用者：僅自己（Demo）或網域內使用者
4. 授權 Drive / Sheets 權限
5. 開啟 Web App URL

首次開啟會進入初始化畫面，建立：

- Drive 根目錄「客戶資料」
- DriveDocs Index（Google Sheet）
- 預設文件分類模板

可在 **Settings → 匯入示範客戶** 載入注音排序展示用資料。

---

## MVP 功能

| 模組 | 能力 |
| --- | --- |
| Customer | 新增／編輯／刪除、搜尋、注音排序、自動建立資料夾 |
| Document | 上傳、預覽、Drive 開啟、刪除（不落地網站） |
| Dashboard | 總客戶數、今日新增／整理、完成率、Recent Activity |
| Reports | 每日整理、文件缺漏、完成率 |
| Settings | 根目錄、分類模板、命名規則、管理員 |

### 預設資料夾模板

```
客戶資料
└── 王大明
    ├── 01 基本資料
    ├── 02 保單
    ├── 03 保全文件
    ├── 04 理賠
    ├── 05 財務規劃
    ├── 06 其他
    └── metadata.json
```

分類可在 Settings 修改。

---

## 產品原則

1. **Google Drive First** — 所有文件只存在 Drive  
2. **Simple Workflow** — 操作不超過三步  
3. **Folder-based Management** — 客戶＝資料夾  
4. **Taiwan Friendly** — 中文介面、注音排序、Workspace

---

## MVP 範圍外（Roadmap）

- OCR／AI 分類與摘要  
- 多人權限、電子簽章  
- 行動 App、Calendar 整合  

詳見 [`docs/PRD.md`](docs/PRD.md)。

---

## 授權

Demo / portfolio 專案。可自由修改作為作品集展示。
