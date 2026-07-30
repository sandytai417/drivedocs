# DriveDocs

**Organize Client Documents Directly in Google Drive.**

這份 repo 目前以 **GitHub Pages 靜態 Demo** 為主，可直接在瀏覽器體驗客戶管理、注音排序、完成度與報表。介面採用 **Cosmos** 亞麻畫廊風（linen `#f7f5f3`、ink 單色 chrome、Fraunces 細字重）。  
正式接 Google Drive / Sheets 的 Apps Script 原始碼在 [`apps-script/`](apps-script/)。

---

## 線上 Demo（GitHub Pages）

啟用 Pages 後網址：

**https://sandytai417.github.io/drivedocs/**

### 啟用方式

1. 打開 https://github.com/sandytai417/drivedocs/settings/pages  
2. **Source** 選 **Deploy from a branch**  
3. Branch：`main` → folder：`/ (root)` → Save  

約一兩分鐘後即可開啟上方網址。

Demo 資料存在瀏覽器 `localStorage`，**不會**寫入真實 Google Drive。

---

## 專案結構

```
index.html          # GitHub Pages 入口
css/styles.css
js/
  zhuyin.js         # 注音排序
  store.js          # 本機資料層
  app.js            # UI
apps-script/        # 正式版（Google Apps Script + Drive + Sheets）
docs/PRD.md
```

---

## 本地預覽

```bash
# 任選靜態伺服器
npx serve .
# 或
python3 -m http.server 8080
```

開啟 `http://localhost:8080`。

---

## 正式版（Apps Script）

見 [`apps-script/`](apps-script/)：

```bash
cd apps-script
npm install
npx clasp login
npx clasp create --title "DriveDocs" --type webapp --rootDir .
npx clasp push
```

部署為網頁應用程式後，文件會直寫 Google Drive。

---

## 產品理念

> Google Drive is the database. DriveDocs is the interface.
