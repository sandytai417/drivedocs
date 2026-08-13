/**
 * DriveDocs — Setting.gs（設定與 API）
 * 請整份覆蓋 Apps Script 的「Setting」或「SettingsService」
 */

function initializeWorkspace() {
  // —— 1) 試算表 ——
  var ss = null;
  try {
    ss = getSpreadsheet_();
  } catch (e1) {
    throw new Error('初始化失敗（試算表）：' + (e1 && e1.message ? e1.message : e1));
  }
  if (!ss) {
    try {
      ss = SpreadsheetApp.create('DriveDocs Index');
    } catch (e2) {
      throw new Error('無法建立試算表，請重新授權 Spreadsheets。詳情：' + (e2.message || e2));
    }
  }
  if (!ss) throw new Error('初始化失敗：試算表仍為空');

  var ssId = null;
  try { ssId = ss.getId(); } catch (e3) { ssId = null; }
  if (!ssId) throw new Error('初始化失敗：試算表 getId() 失敗');
  setProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID, ssId);

  // —— 2) Drive 根目錄（不依賴 getSetting，避免初始化雞生蛋）——
  var root = ensureRootFolderForInit_();
  if (!root) throw new Error('初始化失敗：Drive 根目錄仍為空（請確認已授權 Google Drive）');

  var rootId = null;
  try { rootId = root.getId(); } catch (e4) { rootId = null; }
  if (!rootId) throw new Error('初始化失敗：根目錄 getId() 失敗');
  setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, rootId);

  // —— 3) 預設設定（此時試算表已可用）——
  try {
    var cats = getSetting('categories', null);
    if (!cats || !cats.length) {
      setSetting('categories', CONFIG.DEFAULT_CATEGORIES.slice());
    }
    if (!getSetting('rootFolderName', null)) {
      setSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME || '千婷-整理客戶資料');
    }
    if (!getSetting('namingRule', null)) {
      setSetting('namingRule', '{name}');
    }
  } catch (e5) {
    throw new Error('初始化失敗（寫入設定）：' + (e5 && e5.message ? e5.message : e5));
  }

  setProp_(CONFIG.PROP_KEYS.INITIALIZED, 'true');
  return getAppState();
}

/**
 * 初始化專用：只靠 CONFIG / Properties，不呼叫 getSetting
 */
function ensureRootFolderForInit_() {
  try {
    return resolveCustomerRootFolder_(false);
  } catch (e) {
    throw new Error('無法存取 Google Drive（請重新授權 Drive）。詳情：' + (e.message || e));
  }
}

function getAppState() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch (e) {
    email = '';
  }
  var initialized = false;
  try { initialized = isInitialized(); } catch (e) { initialized = false; }

  var settings = null;
  if (initialized) {
    try { settings = getSettingsLite_(); } catch (e) { settings = null; }
  }

  var ownerName = cleanOwnerName_((CONFIG && CONFIG.OWNER_NAME) || '楊以寧');

  return {
    appName: (CONFIG && CONFIG.APP_NAME) || 'DriveDocs',
    appVersion: (CONFIG && CONFIG.APP_VERSION) || '',
    tagline: (CONFIG && CONFIG.TAGLINE) || '',
    initialized: initialized,
    user: {
      email: email,
      name: ownerName,
      gender: (CONFIG && CONFIG.OWNER_GENDER) || '',
      role: '',
      display: ownerName
    },
    owner: {
      name: ownerName,
      gender: (CONFIG && CONFIG.OWNER_GENDER) || '',
      role: '',
      display: ownerName
    },
    settings: settings,
    supportedExt: (CONFIG && CONFIG.SUPPORTED_EXT) || [],
    privateSingleUser: true,
    paths: (CONFIG && CONFIG.DRIVE_PATHS) || {
      CUSTOMERS: '我的雲端硬碟／千婷-整理客戶資料／{注音}／{客戶姓名}／{資料日期}',
      ACTIVITIES: '我的雲端硬碟／千婷-上傳本週115年活動／{N}月活動／{Y}年{M}月第W週活動'
    }
  };
}

/** 強制去掉職稱字樣（保險業務員等） */
function cleanOwnerName_(s) {
  var name = String(s == null ? '' : s).trim() || '楊以寧';
  name = name
    .replace(/\s*保險業務員\s*/g, '')
    .replace(/\s*業務員\s*/g, '')
    .replace(/\s*保險顧問\s*/g, '')
    .replace(/[·•｜|／/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || '楊以寧';
}

/** 啟動用輕量設定：不呼叫 DriveApp */
function getSettingsLite_() {
  var rootId = getProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID) || '';
  var ssId = getProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID) || '';
  var categories = getCategoryTemplate_();
  return {
    rootFolderName: (function () {
      var n = String(getSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME) || '').trim();
      var legacy = (CONFIG && CONFIG.LEGACY_ROOT_NAME) || '客戶資料';
      var wanted = (CONFIG && CONFIG.DEFAULT_ROOT_NAME) || '千婷-整理客戶資料';
      if (!n || n === legacy) return wanted;
      return n;
    })(),
    rootFolderId: rootId,
    rootFolderUrl: rootId ? ('https://drive.google.com/drive/folders/' + rootId) : '',
    categories: categories,
    defaultDocCategory: defaultDocCategory_(categories),
    namingRule: getSetting('namingRule', '{name}'),
    birthdayReminderEnabled: !!getSetting('birthdayReminderEnabled', false),
    birthdayReminderSchedule: '每週一 09:00（台北時間）',
    ownerName: cleanOwnerName_((CONFIG && CONFIG.OWNER_NAME) || '楊以寧'),
    ownerRole: '',
    ownerDisplay: cleanOwnerName_((CONFIG && CONFIG.OWNER_DISPLAY) || (CONFIG && CONFIG.OWNER_NAME) || '楊以寧'),
    appVersion: (CONFIG && CONFIG.APP_VERSION) || '',
    spreadsheetId: ssId,
    spreadsheetUrl: ssId ? ('https://docs.google.com/spreadsheets/d/' + ssId) : ''
  };
}

function getSettings() {
  return getSettingsLite_();
}

function saveSettings(data) {
  data = data || {};
  if (data.rootFolderName) {
    setSetting('rootFolderName', String(data.rootFolderName).trim());
    try {
      var f = getRootFolder_();
      if (f) f.setName(String(data.rootFolderName).trim());
    } catch (e) { /* ignore */ }
  }
  if (data.categories && data.categories.length) {
    setSetting('categories', ['保單']);
  }
  if (data.namingRule !== undefined) {
    setSetting('namingRule', String(data.namingRule));
  }
  if (data.birthdayReminderEnabled !== undefined) {
    var on = !!data.birthdayReminderEnabled;
    if (on) enableWeeklyBirthdayReminder();
    else disableWeeklyBirthdayReminder();
  }
  return getSettings();
}

function ensureReady_() {
  if (!isInitialized()) {
    throw new Error('請先初始化 DriveDocs 工作區');
  }
  // 若標記已初始化但試算表遺失，嘗試自動修復
  try {
    getSpreadsheet_();
  } catch (e) {
    throw new Error('索引試算表遺失，請重新執行 initializeWorkspace。詳情：' + (e.message || e));
  }
}

/**
 * 啟動一次到位：自動初始化（若需要）+ App 狀態 + 首頁資料
 * 前端冷啟動只打這支，避免 api_getAppState → api_getHome 雙 round-trip
 */
function bootWorkspace() {
  var cachedBoot = sharedGetJson_('bootPayload_v8');
  if (cachedBoot && cachedBoot.app && cachedBoot.home) {
    return cachedBoot;
  }

  var initialized = false;
  try { initialized = isInitialized(); } catch (e) { initialized = false; }

  if (!initialized) {
    initializeWorkspace();
  } else {
    try {
      getSpreadsheet_();
    } catch (e) {
      initializeWorkspace();
    }
  }

  // 以 Drive 實際資料夾對齊客戶列表
  try { ensureDriveIndexSynced_(false); } catch (eSync) { /* ignore */ }

  var app = getAppState();
  var home = null;
  try { home = getHomePayload_(); } catch (e) { home = null; }

  var payload = {
    app: app,
    home: home,
    activities: null,
    weekLabel: '',
    activityPathHint: '',
    appVersion: (CONFIG && CONFIG.APP_VERSION) || '',
    paths: (CONFIG && CONFIG.DRIVE_PATHS) || {
      CUSTOMERS: '我的雲端硬碟／千婷-整理客戶資料／{注音}／{客戶姓名}／{資料日期}',
      ACTIVITIES: '我的雲端硬碟／千婷-上傳本週115年活動／{N}月活動／{Y}年{M}月第W週活動'
    }
  };
  try { payload.weekLabel = currentWeekLabel_(); } catch (e2) { /* keep empty */ }
  try { payload.activityPathHint = activityDrivePathHint_(); } catch (e3) { /* keep empty */ }
  sharedPutJson_('bootPayload_v8', payload, 20);
  return payload;
}

/* —— Client API —— */

function api_boot() { return bootWorkspace(); }
function api_getAppState() { return getAppState(); }
function api_initialize() { return initializeWorkspace(); }
function api_syncDrive(force) {
  ensureReady_();
  return syncCustomersWithDrive_({ force: !!force });
}
function api_getDashboard() { ensureReady_(); return getDashboard(); }
function api_getHome() { ensureReady_(); return getHomePayload(); }
function api_listCustomers(sortBy) { ensureReady_(); return listCustomers(sortBy); }
function api_getCustomer(id, withFiles) {
  ensureReady_();
  return getCustomer(id, { skipFiles: withFiles === false });
}
function api_listCustomerCategoryFiles(customerId, categoryName) {
  ensureReady_();
  return listCustomerCategoryFiles(customerId, categoryName);
}
function api_createCustomer(data) {
  ensureReady_();
  if (data == null) data = {};
  if (typeof data === 'string') data = { name: data, customerName: data };
  return createCustomer(data);
}
function api_ensureCustomer(data) {
  ensureReady_();
  if (data == null) data = {};
  if (typeof data === 'string') data = { name: data, customerName: data };
  return ensureCustomer(data);
}
function api_parseCustomerImport(text) {
  ensureReady_();
  return parseCustomerImportText_(text);
}
function api_importCustomers(payload) {
  ensureReady_();
  return importCustomersBulk(payload);
}
function api_updateCustomer(id, data) { ensureReady_(); return updateCustomer(id, data); }
function api_deleteCustomer(id) { ensureReady_(); return deleteCustomer(id); }
function api_updateFolderMeta(customerId, category, patch) {
  ensureReady_();
  return updateFolderMeta(customerId, category, patch);
}
function api_search(query) { ensureReady_(); return searchAll(query); }
function api_uploadDocument(payload) { ensureReady_(); return uploadDocument(payload); }
function api_importDocument(payload) { ensureReady_(); return importDocument(payload); }
function api_uploadDocuments(payload) { ensureReady_(); return uploadDocuments(payload); }
function api_importDocuments(payload) { ensureReady_(); return importDocuments(payload); }
function api_searchDriveFiles(query, limit) { ensureReady_(); return searchDriveFiles(query, limit); }
function api_resolveDriveFile(input) { ensureReady_(); return resolveDriveFile(input); }
function api_listDriveFolder(folderId) { ensureReady_(); return listDriveFolder(folderId || ''); }
function api_getPickerConfig() { ensureReady_(); return getPickerConfig(); }
function api_deleteDocument(payload) { ensureReady_(); return deleteDocument(payload); }
function api_getReports() { ensureReady_(); return getReports(); }
function api_listBirthdaysThisWeek() { ensureReady_(); return listBirthdaysThisWeek(); }
function api_getBirthdayReminderStatus() { ensureReady_(); return getBirthdayReminderStatus(); }
function api_enableBirthdayReminder() { ensureReady_(); return enableWeeklyBirthdayReminder(); }
function api_disableBirthdayReminder() { ensureReady_(); return disableWeeklyBirthdayReminder(); }
function api_sendBirthdayReminder(force) {
  ensureReady_();
  return sendWeeklyBirthdayReminder({ force: !!force });
}
function api_getSettings() { ensureReady_(); return getSettings(); }
function api_saveSettings(data) { ensureReady_(); return saveSettings(data); }
function api_seedDemo() { ensureReady_(); return seedDemoData(); }
function api_listLectures() { ensureReady_(); return listLectures(); }
function api_listActivities() { ensureReady_(); return listActivities(); }
function api_createLecture(data) { ensureReady_(); return createLecture(data); }
function api_createActivity(data) { ensureReady_(); return createActivity(data); }
function api_quickAddToThisWeekActivity(payload) { ensureReady_(); return quickAddToThisWeekActivity(payload); }
function api_listWeekOptions(weeksBack) { ensureReady_(); return listWeekPeriodOptions(weeksBack); }
function api_currentWeekLabel() { return currentWeekLabel_(); }
function api_activityDrivePathHint(period) { return activityDrivePathHint_(period); }
function api_currentMonthLabel() { return currentMonthLabel_(); }
