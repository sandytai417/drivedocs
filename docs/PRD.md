# DriveDocs PRD v1.0

Google Drive Native Client Document Management System

## 1. Product Overview

**Product Name:** DriveDocs  
**Tagline:** Organize Client Documents Directly in Google Drive.

DriveDocs 是一套建立在 Google Drive 之上的客戶文件管理系統。它不建立另一套檔案系統，而是直接利用 Google Drive 作為唯一的文件儲存空間，透過更好的管理介面，協助使用者快速建立客戶、整理文件、搜尋資料與追蹤文件完成度。

**核心理念：** Google Drive is the database. DriveDocs is the interface.

## 2. Target Users

保險業務、財務顧問、房仲、代書、會計事務所、法律事務所、中小企業行政。

### Common Problems

自行在 Drive 建資料夾、命名、拖曳 PDF，久了後：找不到客戶、命名不一致、不知缺件、難搜尋、無法管理流程。

## 3. Product Goals

Web App 提供：Google Login、客戶／文件管理、Drive 自動建夾、完成度、Dashboard、搜尋、每日整理進度。

## 4. Product Principles

- Google Drive First  
- Simple Workflow（≤ 3 steps）  
- Folder-based Management  
- Taiwan Friendly（注音排序、中文、Workspace）

## 5–16. UX Spec

見原 PRD：Dashboard、注音客戶列表、Customer Detail、Upload、Search、Progress、Reports、Settings。

## 17. Functional Requirements

Customer / Document / Dashboard / Reports CRUD 與完成度計算（本 Repo MVP 已實作）。

## 18. Non-functional

Google Login、Desktop／Tablet 響應式、Chrome／Edge／Safari、Workspace 整合、文件不落地網站。

## 19. Tech Stack（Demo）

Apps Script HTML Service + Drive + Sheets + OAuth + GitHub。

## 20. MVP Scope

**Included:** Login、Dashboard、Customer List／Detail、新增客戶、自動建夾、上傳、Drive 瀏覽、注音排序、搜尋、完成度、每日報表。  

**Excluded:** OCR、AI 分類、多人權限、電子簽章、行動 App、Calendar。

## 21. Roadmap

- **v1.1** OCR、批次上傳、拖放排序、自訂分類  
- **v1.2** 協作權限、Calendar、標籤篩選、批次匯出  
- **v2.0** 行動 App、AI 摘要／缺件／命名、自動待辦  
