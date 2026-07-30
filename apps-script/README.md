# DriveDocs — Google Apps Script（正式版）

此目錄為接 Google Drive / Sheets 的 Web App 原始碼。

GitHub Pages 靜態 Demo 在 repo 根目錄；要真實寫入 Drive 請用 clasp 部署本目錄。

```bash
npm install
npx clasp login
npx clasp create --title "DriveDocs" --type webapp --rootDir .
# 或複製 .clasp.json.example → .clasp.json
npx clasp push
npx clasp open
```

然後在 Apps Script：**部署 → 新增部署 → 網頁應用程式**。
