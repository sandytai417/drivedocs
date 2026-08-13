/**
 * DriveDocs — Web App 入口
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.initialPage = (e && e.parameter && e.parameter.page) || 'dashboard';
  return template
    .evaluate()
    .setTitle('DriveDocs — 楊以寧')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('DriveDocs')
      .addItem('初始化工作區', 'initializeWorkspace')
      .addItem('立刻同步 Drive', 'menuSyncDrive_')
      .addSeparator()
      .addItem('啟用每週壽星提醒', 'enableWeeklyBirthdayReminder')
      .addItem('關閉每週壽星提醒', 'disableWeeklyBirthdayReminder')
      .addItem('立刻寄送本週壽星', 'sendWeeklyBirthdayReminderMenu_')
      .addToUi();
  } catch (err) {
    // 非試算表綁定時略過
  }
}

function menuSyncDrive_() {
  var res = syncCustomersWithDrive_({ force: true });
  var msg = '已檢查 ' + (res.checked || 0) + ' 筆';
  if (res.removed) msg += ' · 移除 ' + res.removed + ' 筆（Drive 無資料夾）';
  if (res.imported) msg += ' · 從 Drive 加入 ' + res.imported + ' 位';
  if (!res.removed && !res.imported) msg += ' · 無需更新';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* ignore */ }
  return res;
}

function sendWeeklyBirthdayReminderMenu_() {
  var res = sendWeeklyBirthdayReminder({ force: true });
  try {
    SpreadsheetApp.getUi().alert(res.message || (res.sent ? '已寄送' : '已完成'));
  } catch (e) { /* ignore */ }
}
