DriveDocs 可複製原始檔（v260813z）
================================
客戶資料夾必須在：客戶資料／{注音}／{姓名}／民國日期
例如：客戶資料／ㄉ／戴**／1150813

開啟或「立刻同步 Drive」會把誤放在
  客戶資料／姓名
  客戶資料／客戶／注音／姓名
的姓名夾搬進對應注音夾。

每個 *.txt 就是 Apps Script 要貼上的完整內容。
檔名去掉 .txt 就是 Apps Script 裡的檔名。
這次請覆蓋：
  DriveFolder.gs、DriveService.gs、Config.gs
  App.html、Index.html
貼完請部署 → 新版本。畫面上應顯示 v260813z。
