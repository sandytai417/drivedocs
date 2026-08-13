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
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('DriveDocs')
      .addItem('初始化工作區', 'initializeWorkspace')
      .addItem('匯入示範資料', 'seedDemoData')
      .addSeparator()
      .addItem('啟用每週壽星提醒', 'enableWeeklyBirthdayReminder')
      .addItem('關閉每週壽星提醒', 'disableWeeklyBirthdayReminder')
      .addItem('立刻寄送本週壽星', 'sendWeeklyBirthdayReminderMenu_')
      .addToUi();
  } catch (err) {
    // 非試算表綁定時略過
  }
}

function sendWeeklyBirthdayReminderMenu_() {
  var res = sendWeeklyBirthdayReminder({ force: true });
  try {
    SpreadsheetApp.getUi().alert(res.message || (res.sent ? '已寄送' : '已完成'));
  } catch (e) { /* ignore */ }
}
