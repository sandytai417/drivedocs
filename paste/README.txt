DriveDocs 可複製原始檔（v260814e）
================================
這次更新：
- 上傳完成會顯示「上傳成功」，進度條會持續移動（讀檔／上傳百分比＋條紋動畫）
- 每週壽星信會帶姓名、電話、郵箱、性別、地址、生日
- 客戶路徑：我的雲端硬碟／千婷-整理客戶資料／{注音}／{客戶姓名}／{資料日期}
- 活動路徑：我的雲端硬碟／千婷-上傳本週115年活動／{N}月活動／{Y}年{M}月第W週活動

每個 *.txt 就是 Apps Script 要貼上的完整內容。
檔名去掉 .txt 就是 Apps Script 裡的檔名。
這次請覆蓋：
  Config.gs、DriveFolder.gs、Utils.gs、EventService.gs
  Setting.gs、BirthdayService.gs、App.html、Stylesheet.html、Index.html
貼完請部署 → 新版本。畫面上應顯示 v260814e。

請用 GitHub Raw 全選複製。DriveService.gs 最後一行必須是：
  // END DriveService.gs
