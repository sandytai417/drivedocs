DriveDocs 可複製原始檔（v260814a）
================================
修復：v260813z 的 DriveFolder.gs 有一段殘碼會在存檔時去動 Drive，
造成「曾嘗試執行 listCustomers／isInitialized，但無法順利儲存」。

請務必整份覆蓋 DriveFolder.gs（不要只貼新增段落）。

每個 *.txt 就是 Apps Script 要貼上的完整內容。
檔名去掉 .txt 就是 Apps Script 裡的檔名。
這次請覆蓋：
  DriveFolder.gs、Config.gs、App.html、Index.html
貼完請部署 → 新版本。畫面上應顯示 v260814a。

搬進注音夾改為按「立刻同步 Drive」或上傳時才執行，開啟網站不會再一邊掃一邊搬。
