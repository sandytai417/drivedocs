/**
 * DriveDocs — 設定常數
 * Google Drive 是資料庫；DriveDocs 是介面。
 * 定位：私人單人版
 */

var CONFIG = {
  APP_NAME: 'DriveDocs',
  APP_VERSION: '260814a',
  TAGLINE: 'Organize Client Documents Directly in Google Drive.',
  /** 系統擁有者（私人單人版）— 僅顯示姓名，不含職稱 */
  OWNER_NAME: '楊以寧',
  OWNER_GENDER: '女',
  OWNER_ROLE: '',
  OWNER_DISPLAY: '楊以寧',
  /**
   * Drive 路徑規則（固定）
   * 客戶：我的雲端硬碟／客戶資料／{注音}／{客戶姓名}／{民國日期}
   * 例：我的雲端硬碟／客戶資料／ㄉ／戴**／1150813
   * 活動：我的雲端硬碟／{年}／{N}月活動／{Y}年{M}月第W週活動
   */
  DRIVE_PATHS: {
    CUSTOMERS: '我的雲端硬碟／客戶資料／{注音}／{客戶姓名}／{資料日期}',
    ACTIVITIES: '我的雲端硬碟／{年}／{N}月活動／{Y}年{M}月第W週活動'
  },
  CUSTOMERS_BUCKET: '',
  DEFAULT_DOC_CATEGORY_HINT: '保單',
  PROP_KEYS: {
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
    INITIALIZED: 'INITIALIZED',
    SHEETS_OK: 'SHEETS_OK'
  },
  SHEETS: {
    CUSTOMERS: 'Customers',
    SETTINGS: 'Settings',
    ACTIVITY: 'Activity',
    REPORTS: 'Reports',
    LECTURES: 'Lectures',
    ACTIVITIES: 'Activities'
  },
  CUSTOMER_HEADERS: [
    'id', 'name', 'phone', 'email', 'birthday', 'gender', 'idNumber', 'address',
    'tags', 'notes', 'folderId', 'folderMeta', 'createdAt', 'updatedAt',
    'completion', 'status', 'fileCount', 'zhuyin'
  ],
  DEFAULT_CATEGORIES: [
    '保單'
  ],
  DEFAULT_ROOT_NAME: '客戶資料',
  SUPPORTED_MIME: {
    'application/pdf': true,
    'image/jpeg': true,
    'image/png': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
    'application/vnd.ms-powerpoint': true,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
    'text/plain': true
  },
  SUPPORTED_EXT: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx', 'ppt', 'pptx', 'txt']
};

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function isInitialized() {
  try {
    return getProp_(CONFIG.PROP_KEYS.INITIALIZED) === 'true';
  } catch (e) {
    return false;
  }
}
