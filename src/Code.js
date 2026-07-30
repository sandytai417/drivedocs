/**
 * DriveDocs — Web App entry
 * Google Drive is the database. DriveDocs is the interface.
 */

/**
 * Serve the SPA shell.
 * @param {Object} e
 * @return {HtmlOutput}
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.initialPage = (e && e.parameter && e.parameter.page) || 'dashboard';
  return template
    .evaluate()
    .setTitle('DriveDocs — Organize Client Documents Directly in Google Drive')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Include HTML partials (CSS / JS).
 * @param {string} filename
 * @return {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Manual menu for spreadsheet-bound / editor testing.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('DriveDocs')
      .addItem('初始化工作區', 'initializeWorkspace')
      .addItem('匯入示範資料', 'seedDemoData')
      .addToUi();
  } catch (e) {
    // not bound to a spreadsheet — ignore
  }
}
