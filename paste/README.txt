DriveDocs 可複製原始檔（v260814c）
================================
修復：客戶資訊儲存後看不到。開啟「客戶資訊／備註」會載入完整資料，
儲存後用伺服器回傳的內容重畫，不再用精簡列表快取蓋掉。

每個 *.txt 就是 Apps Script 要貼上的完整內容。
檔名去掉 .txt 就是 Apps Script 裡的檔名。
這次請覆蓋：
  App.html、DashboardService.gs、Config.gs、Index.html
貼完請部署 → 新版本。畫面上應顯示 v260814c。

DriveService.gs 若仍出現 Unexpected end of input，請整份覆蓋，
最後一行必須是：// END DriveService.gs
