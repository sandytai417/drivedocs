/**
 * DriveDocs — Settings & workspace bootstrap
 */

/**
 * Initialize Drive root + Sheets index + default settings.
 * @return {Object}
 */
function initializeWorkspace() {
  getSpreadsheet_();
  var root = getRootFolder_();

  if (!getSetting('categories', null)) {
    setSetting('categories', CONFIG.DEFAULT_CATEGORIES);
  }
  if (!getSetting('rootFolderName', null)) {
    setSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME);
  }
  if (!getSetting('namingRule', null)) {
    setSetting('namingRule', '{name}');
  }
  if (!getSetting('admins', null)) {
    setSetting('admins', [Session.getActiveUser().getEmail()]);
  }

  setProp_(CONFIG.PROP_KEYS.INITIALIZED, 'true');
  setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, root.getId());

  return getAppState();
}

/**
 * Full app bootstrap payload for the frontend.
 * @return {Object}
 */
function getAppState() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch (e) {
    email = '';
  }

  var initialized = isInitialized();
  var settings = null;
  if (initialized) {
    settings = getSettings();
  }

  return {
    appName: CONFIG.APP_NAME,
    tagline: CONFIG.TAGLINE,
    initialized: initialized,
    user: { email: email },
    settings: settings,
    supportedExt: CONFIG.SUPPORTED_EXT
  };
}

/**
 * Read settings for Settings page.
 * @return {Object}
 */
function getSettings() {
  return {
    rootFolderName: getSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME),
    rootFolderId: getProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID) || '',
    rootFolderUrl: (function () {
      try {
        return getRootFolder_().getUrl();
      } catch (e) {
        return '';
      }
    })(),
    categories: getCategoryTemplate_(),
    namingRule: getSetting('namingRule', '{name}'),
    admins: getSetting('admins', []),
    spreadsheetId: getProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID) || '',
    spreadsheetUrl: (function () {
      try {
        return getSpreadsheet_().getUrl();
      } catch (e) {
        return '';
      }
    })()
  };
}

/**
 * Save settings from UI.
 * @param {Object} data
 * @return {Object}
 */
function saveSettings(data) {
  if (data.rootFolderName) {
    setSetting('rootFolderName', String(data.rootFolderName).trim());
    try {
      var root = getRootFolder_();
      root.setName(String(data.rootFolderName).trim());
    } catch (e) { /* ignore rename fail */ }
  }
  if (data.categories && data.categories.length) {
    var cleaned = data.categories
      .map(function (c) { return String(c).trim(); })
      .filter(Boolean);
    if (!cleaned.length) throw new Error('至少需要一個文件分類');
    setSetting('categories', cleaned);
  }
  if (data.namingRule !== undefined) {
    setSetting('namingRule', String(data.namingRule));
  }
  if (data.admins !== undefined) {
    setSetting('admins', data.admins);
  }
  return getSettings();
}

/**
 * Client-facing API wrappers with consistent error shape.
 * (google.script.run cannot return thrown Error messages reliably without withFailureHandler)
 */

function api_getAppState() {
  return getAppState();
}

function api_initialize() {
  return initializeWorkspace();
}

function api_getDashboard() {
  ensureReady_();
  return getDashboard();
}

function api_listCustomers(sortBy) {
  ensureReady_();
  return listCustomers(sortBy);
}

function api_getCustomer(id) {
  ensureReady_();
  return getCustomer(id);
}

function api_createCustomer(data) {
  ensureReady_();
  return createCustomer(data);
}

function api_updateCustomer(id, data) {
  ensureReady_();
  return updateCustomer(id, data);
}

function api_deleteCustomer(id) {
  ensureReady_();
  return deleteCustomer(id);
}

function api_search(query) {
  ensureReady_();
  return searchAll(query);
}

function api_uploadDocument(payload) {
  ensureReady_();
  return uploadDocument(payload);
}

function api_deleteDocument(payload) {
  ensureReady_();
  return deleteDocument(payload);
}

function api_getReports() {
  ensureReady_();
  return getReports();
}

function api_getSettings() {
  ensureReady_();
  return getSettings();
}

function api_saveSettings(data) {
  ensureReady_();
  return saveSettings(data);
}

function api_seedDemo() {
  ensureReady_();
  return seedDemoData();
}

function ensureReady_() {
  if (!isInitialized()) {
    throw new Error('請先初始化 DriveDocs 工作區');
  }
}
