/**
 * DriveDocs — 示範資料（已停用虛構客戶）
 * 客戶列表只收錄 Drive 裡實際存在的姓名資料夾，不匯入假姓名。
 */

function seedDemoData() {
  var total = 0;
  try {
    total = filterRowsWithDriveFolder_(sheetToObjects_(CONFIG.SHEETS.CUSTOMERS)).length;
  } catch (e) {
    try { total = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).length; } catch (e2) { total = 0; }
  }
  return {
    created: 0,
    total: total,
    message: '已停用示範客戶：不會匯入虛構姓名。請在雲端硬碟建立「客戶資料／注音／姓名」資料夾後，到設定按「立刻同步 Drive」。'
  };
}
