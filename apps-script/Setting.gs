/**
 * DriveDocs — Setting.gs（設定與 API）
 * 請整份覆蓋 Apps Script 的「Setting」
 */

function initializeWorkspace() {
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

  var root = ensureRootFolderForInit_();
  if (!root) throw new Error('初始化失敗：Drive 根目錄仍為空（請確認已授權 Google Drive）');

  var rootId = null;
  try { rootId = root.getId(); } catch (e4) { rootId = null; }
  if (!rootId) throw new Error('初始化失敗：根目錄 getId() 失敗');
  setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, rootId);

  try {
    // 清除舊分類設定，改為日期分夾
    setSetting('categories', []);
    setSetting('organizeBy', 'date');
    if (!getSetting('rootFolderName', null)) {
      setSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME || '客戶資料');
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

function ensureRootFolderForInit_() {
  var id = '';
  try { id = getProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID) || ''; } catch (e) { id = ''; }

  if (id) {
    try {
      var existing = DriveApp.getFolderById(id);
      if (existing && !existing.isTrashed()) return existing;
    } catch (e) {
      try { setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, ''); } catch (ignore) {}
    }
  }

  var name = '客戶資料';
  try {
    if (CONFIG && CONFIG.DEFAULT_ROOT_NAME) name = String(CONFIG.DEFAULT_ROOT_NAME).trim() || name;
  } catch (e) { /* keep */ }

  var folder = null;
  try {
    var it = DriveApp.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  } catch (e) {
    throw new Error('無法存取 Google Drive（請重新授權 Drive）。詳情：' + (e.message || e));
  }
  return folder || null;
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
    organizeBy: 'date'
  };
}

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

function getSettingsLite_() {
  var rootId = getProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID) || '';
  var ssId = getProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID) || '';
  return {
    rootFolderName: getSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME),
    rootFolderId: rootId,
    rootFolderUrl: rootId ? ('https://drive.google.com/drive/folders/' + rootId) : '',
    categories: [],
    organizeBy: 'date',
    defaultDocCategory: '',
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
  // 不再接受文件類型分類
  setSetting('categories', []);
  setSetting('organizeBy', 'date');
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
  try {
    getSpreadsheet_();
  } catch (e) {
    throw new Error('索引試算表遺失，請重新執行 initializeWorkspace。詳情：' + (e.message || e));
  }
}

/**
 * 啟動一次到位：自動初始化 + App 狀態 + 首頁 + Drive 同步
 */
function bootWorkspace() {
  var cachedBoot = sharedGetJson_('bootPayload_v3');
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

  // Drive → 網站同步（刪夾即清索引；有短快取）
  var sync = { removed: 0, checked: 0, ids: [] };
  try { sync = syncCustomersWithDrive_({ force: false }); } catch (eS) { /* ignore */ }

  var app = getAppState();
  var home = null;
  try { home = getHomePayload_(); } catch (e) { home = null; }
  var activities = null;
  try { activities = listActivities(); } catch (eA) { activities = null; }

  var weekLabel = '';
  try { weekLabel = currentWeekLabel_(); } catch (e2) { weekLabel = ''; }
  var activityPathHint = '';
  try { activityPathHint = activityDrivePathHint_(); } catch (e3) { activityPathHint = ''; }

  var payload = {
    app: app,
    home: home,
    activities: activities,
    weekLabel: weekLabel,
    activityPathHint: activityPathHint,
    sync: sync,
    appVersion: (CONFIG && CONFIG.APP_VERSION) || '',
    paths: (CONFIG && CONFIG.DRIVE_PATHS) || {
      CUSTOMERS: '我的雲端硬碟／客戶資料／客戶／{注音}／{客戶姓名}／{資料日期}／',
      ACTIVITIES: '我的雲端硬碟／{年}／{N}月活動／{Y}年{M}月第W週活動'
    }
  };
  sharedPutJson_('bootPayload_v3', payload, 120);
  return payload;
}

/* —— Client API —— */

function api_boot() { return bootWorkspace(); }
function api_getAppState() { return getAppState(); }
function api_initialize() { return initializeWorkspace(); }
function api_syncDrive(force) {
  ensureReady_();
  var res = syncCustomersWithDrive_({ force: !!force });
  invalidateSheetCache_(CONFIG.SHEETS.CUSTOMERS);
  sharedRemove_('bootPayload_v3');
  sharedRemove_('homePayload_v3');
  return res;
}
function api_getDashboard() { ensureReady_(); return getDashboard(); }
function api_getHome() { ensureReady_(); return getHomePayload(); }
function api_listCustomers(sortBy) { ensureReady_(); return listCustomers(sortBy); }
function api_getCustomer(id, withFiles) {
  ensureReady_();
  return getCustomer(id, { skipFiles: withFiles === false });
}
function api_listCustomerCategoryFiles(customerId, dateName) {
  ensureReady_();
  return listCustomerDateFiles(customerId, dateName);
}
function api_listCustomerDateFiles(customerId, dateName) {
  ensureReady_();
  return listCustomerDateFiles(customerId, dateName);
}
function api_listCustomerDates(customerId) {
  ensureReady_();
  var detail = getCustomer(customerId, { skipFiles: true, light: true });
  var c = detail.customer;
  if (!c.folderId) return { dates: [] };
  var dates = listCustomerDateKeys_(c.folderId);
  // 回寫 folderMeta 日期鍵，加速下次開啟
  var meta = c.folderMeta || {};
  var changed = false;
  dates.forEach(function (d) {
    if (!meta[d]) {
      meta[d] = { done: true, count: 0 };
      changed = true;
    }
  });
  if (changed) {
    updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
      folderMeta: JSON.stringify(meta)
    });
  }
  return { dates: dates, folderMeta: meta };
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
function api_updateCustomer(id, data) { ensureReady_(); return updateCustomer(id, data); }
function api_deleteCustomer(id) { ensureReady_(); return deleteCustomer(id); }
function api_updateFolderMeta(customerId, dateKey, patch) {
  ensureReady_();
  return updateFolderMeta(customerId, dateKey, patch);
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
