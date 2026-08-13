DriveDocs 可複製原始檔（v260814d）
================================
續保改為「客戶底下有兩個或以上日期資料夾」；只有一個日期夾仍是新件。

每個 *.txt 就是 Apps Script 要貼上的完整內容。
檔名去掉 .txt 就是 Apps Script 裡的檔名。
這次請覆蓋：
  DriveFolder.gs、DriveService.gs、DocumentService.gs
  DashboardService.gs、Config.gs、App.html、Index.html
貼完請部署 → 新版本。畫面上應顯示 v260814d。

請用 GitHub Raw 全選複製。DriveService.gs 最後一行必須是：
  // END DriveService.gs
