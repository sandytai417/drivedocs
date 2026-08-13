DriveDocs 可複製原始檔（v260814f）
================================
一次上傳生日名單：設定頁整份貼上「雷佳明05/09 電話:0972905295」，按一次即可。
會建立 千婷-整理客戶資料／注音／姓名，並寫入生日與電話。

每個 *.txt 就是 Apps Script 要貼上的完整內容。
檔名去掉 .txt 就是 Apps Script 裡的檔名。
這次請覆蓋：
  DriveService.gs、Setting.gs、App.html、Config.gs、Index.html
貼完請部署 → 新版本。畫面上應顯示 v260814f。

請用 GitHub Raw 全選複製。DriveService.gs 最後一行必須是：
  // END DriveService.gs

不要把客戶姓名／電話貼進 GitHub。
