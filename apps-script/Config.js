/**
 * DriveDocs — Config & constants
 * Google Drive is the database. DriveDocs is the interface.
 */

var CONFIG = {
  APP_NAME: 'DriveDocs',
  TAGLINE: 'Organize Client Documents Directly in Google Drive.',
  PROP_KEYS: {
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
    INITIALIZED: 'INITIALIZED'
  },
  SHEETS: {
    CUSTOMERS: 'Customers',
    SETTINGS: 'Settings',
    ACTIVITY: 'Activity',
    REPORTS: 'Reports'
  },
  DEFAULT_CATEGORIES: [
    '01 基本資料',
    '02 保單',
    '03 保全文件',
    '04 理賠',
    '05 財務規劃',
    '06 其他'
  ],
  DEFAULT_ROOT_NAME: '客戶資料',
  SUPPORTED_MIME: {
    'application/pdf': true,
    'image/jpeg': true,
    'image/png': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true
  },
  SUPPORTED_EXT: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx']
};

/**
 * Read a script property.
 * @param {string} key
 * @return {string|null}
 */
function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Write a script property.
 * @param {string} key
 * @param {string} value
 */
function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * Whether the workspace has been initialized.
 * @return {boolean}
 */
function isInitialized() {
  return getProp_(CONFIG.PROP_KEYS.INITIALIZED) === 'true';
}
