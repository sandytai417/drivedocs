/**
 * DriveDocs — Drive 資料夾層
 * 路徑：客戶資料／客戶／{注音}／{客戶姓名}／{文件類型}／{資料日期}／檔案
 * （畫面依文件類型分卡；Drive 內再依資料日期分子夾）
 * Drive 是資料庫：刪除客戶資料夾後，可用同步清除網站索引。
 */

function findOrCreateSubfolder_(parent, name) {
  name = String(name || '').trim();
  if (!name) throw new Error('資料夾名稱不可空白');
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function getRootFolder_() {
  var id = getProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID);
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (f && !f.isTrashed()) return f;
    } catch (e) {
      try { setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, ''); } catch (ignore) {}
    }
  }
  var name = getSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME) || CONFIG.DEFAULT_ROOT_NAME;
  var folders = DriveApp.getFoldersByName(name);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
  setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, folder.getId());
  return folder;
}

/** 客戶資料／客戶 */
function getCustomersBucketFolder_() {
  var root = getRootFolder_();
  return findOrCreateSubfolder_(root, CONFIG.CUSTOMERS_BUCKET || '客戶');
}

/**
 * 建立客戶資料夾：客戶資料／客戶／{注音}／{姓名}
 * 不預建分類夾（上傳時才建），加快新增客戶。
 */
function createCustomerFolderTree(customerName, metadata) {
  var bucket = getCustomersBucketFolder_();
  var zhuyin = getZhuyinInitial(customerName);
  var zhFolder = findOrCreateSubfolder_(bucket, zhuyin);
  var existing = zhFolder.getFoldersByName(customerName);
  var customerFolder = existing.hasNext() ? existing.next() : zhFolder.createFolder(customerName);
  writeMetadata_(customerFolder, metadata || {});
  return {
    folderId: customerFolder.getId(),
    zhuyin: zhuyin
  };
}

function writeMetadata_(folder, metadata) {
  var files = folder.getFilesByName('metadata.json');
  var blob = Utilities.newBlob(
    JSON.stringify(metadata, null, 2),
    'application/json',
    'metadata.json'
  );
  if (files.hasNext()) {
    files.next().setContent(blob.getDataAsString());
  } else {
    folder.createFile(blob);
  }
}

function renameCustomerFolder(folderId, newName) {
  var folder = DriveApp.getFolderById(folderId);
  var oldName = folder.getName();
  if (oldName === newName) return;

  var newZh = getZhuyinInitial(newName);
  var parents = folder.getParents();
  var parent = parents.hasNext() ? parents.next() : null;
  if (parent) {
    var grandParents = parent.getParents();
    var bucket = grandParents.hasNext() ? grandParents.next() : getCustomersBucketFolder_();
    var targetZh = findOrCreateSubfolder_(bucket, newZh);
    if (targetZh.getId() !== parent.getId()) {
      try {
        folder.moveTo(targetZh);
      } catch (e) {
        targetZh.addFolder(folder);
        try { parent.removeFolder(folder); } catch (ignore) {}
      }
    }
  }
  folder.setName(newName);
}

function trashCustomerFolder(folderId) {
  try {
    DriveApp.getFolderById(folderId).setTrashed(true);
  } catch (e) { /* already gone */ }
}

/** 資料日期正規化 → yyyy-MM-dd（Drive 資料夾名） */
function normalizeDocDate_(raw) {
  if (typeof coerceDateLikeToYmd_ === 'function') {
    var coerced = coerceDateLikeToYmd_(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(coerced))) return coerced;
    raw = coerced;
  }
  if (typeof parseDateInputToYmd_ === 'function') {
    var ymd = parseDateInputToYmd_(raw, todayStr_());
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return ymd;
  }
  var s = String(raw == null ? '' : raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return todayStr_();
}

function isDateFolderName_(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(name || ''));
}

/** 客戶／{文件類型}／{資料日期} */
function ensureCategoryDateFolder_(customerFolderId, category, docDate) {
  var catName = String(category || '').trim() || defaultDocCategory_();
  var dateName = normalizeDocDate_(docDate);
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var catFolder = findOrCreateSubfolder_(customerFolder, catName);
  return findOrCreateSubfolder_(catFolder, dateName);
}

/** 相容舊呼叫：若誤當日期夾用，仍建分類／日期 */
function ensureDateFolder_(customerFolderId, docDate) {
  return ensureCategoryDateFolder_(customerFolderId, defaultDocCategory_(), docDate);
}

function pushFolderFiles_(folder, categoryName, dateName, result, seen) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.isTrashed()) continue;
    if (f.getName() === 'metadata.json') continue;
    if (seen[f.getId()]) continue;
    seen[f.getId()] = true;
    var dto = fileToDto_(f, categoryName);
    dto.docDate = dateName || dto.docDate || '';
    result.push(dto);
  }
}

/**
 * 列出某分類下所有檔案（分類／日期／檔；相容日期夾直接在客戶根目錄）
 */
function listCategoryFiles(customerFolderId, categoryName) {
  categoryName = String(categoryName || '').trim();
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var result = [];
  var seen = {};

  var subs = customerFolder.getFoldersByName(categoryName);
  while (subs.hasNext()) {
    var cat = subs.next();
    if (cat.isTrashed()) continue;
    pushFolderFiles_(cat, categoryName, '', result, seen);
    var dates = cat.getFolders();
    while (dates.hasNext()) {
      var d = dates.next();
      if (d.isTrashed()) continue;
      var dateName = isDateFolderName_(d.getName()) ? d.getName() : '';
      pushFolderFiles_(d, categoryName, dateName, result, seen);
    }
  }

  result.sort(function (a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return result;
}

function listAllCustomerFiles(customerFolderId) {
  var grouped = listCustomerFilesGrouped_(customerFolderId);
  var all = [];
  Object.keys(grouped).forEach(function (k) {
    all = all.concat(grouped[k] || []);
  });
  return all;
}

/** 依文件類型分組；日期-only 舊夾併入「其他」 */
function listCustomerFilesGrouped_(customerFolderId) {
  var categories = getCategoryTemplate_();
  var grouped = {};
  categories.forEach(function (cat) {
    grouped[cat] = listCategoryFiles(customerFolderId, cat);
  });

  var otherName = '';
  for (var i = 0; i < categories.length; i++) {
    if (String(categories[i]).indexOf('其他') >= 0) {
      otherName = categories[i];
      break;
    }
  }
  if (!otherName && categories.length) otherName = categories[categories.length - 1];
  if (!otherName) return grouped;

  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var seen = {};
  Object.keys(grouped).forEach(function (k) {
    (grouped[k] || []).forEach(function (f) { seen[f.id] = true; });
  });
  var leftovers = [];
  var subs = customerFolder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    if (sub.isTrashed()) continue;
    var name = sub.getName();
    if (categories.indexOf(name) >= 0) continue;
    if (!isDateFolderName_(name)) continue;
    pushFolderFiles_(sub, otherName, name, leftovers, seen);
  }
  if (leftovers.length) {
    grouped[otherName] = (grouped[otherName] || []).concat(leftovers);
  }
  return grouped;
}

function fileToDto_(f, category) {
  return {
    id: f.getId(),
    name: f.getName(),
    mimeType: f.getMimeType(),
    size: f.getSize(),
    url: f.getUrl(),
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + f.getId(),
    previewUrl: 'https://drive.google.com/file/d/' + f.getId() + '/view',
    category: category || '',
    docDate: '',
    updatedAt: Utilities.formatDate(f.getLastUpdated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss"),
    createdAt: Utilities.formatDate(f.getDateCreated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss")
  };
}

function validateUpload_(fileName, mimeType) {
  var ext = String(fileName).split('.').pop().toLowerCase();
  if (CONFIG.SUPPORTED_EXT.indexOf(ext) === -1) {
    throw new Error('不支援的檔案格式：.' + ext);
  }
  if (mimeType && !CONFIG.SUPPORTED_MIME[mimeType]) {
    if (CONFIG.SUPPORTED_EXT.indexOf(ext) === -1) {
      throw new Error('不支援的檔案類型');
    }
  }
}

function uploadFileToCategory(customerFolderId, categoryName, fileName, mimeType, base64Data, docDate) {
  validateUpload_(fileName, mimeType);
  var dateFolder = ensureCategoryDateFolder_(customerFolderId, categoryName, docDate || todayStr_());
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', fileName);
  var file = dateFolder.createFile(blob);
  var dto = fileToDto_(file, categoryName);
  dto.docDate = normalizeDocDate_(docDate || todayStr_());
  return dto;
}

function importDriveFileToCategory(customerFolderId, categoryName, fileId, mode, docDate) {
  mode = mode === 'copy' ? 'copy' : (mode === 'shortcut' ? 'shortcut' : 'move');
  var src = DriveApp.getFileById(String(fileId));
  if (src.isTrashed()) throw new Error('該檔案已在垃圾桶');
  if (src.getMimeType() === 'application/vnd.google-apps.folder') {
    throw new Error('請選擇檔案（不支援整個資料夾）');
  }
  var dateFolder = ensureCategoryDateFolder_(customerFolderId, categoryName, docDate || todayStr_());
  var out;
  if (mode === 'shortcut') {
    try { out = dateFolder.createShortcut(src.getId()); }
    catch (e0) { out = src.makeCopy(src.getName(), dateFolder); }
  } else if (mode === 'move') {
    try { src.moveTo(dateFolder); out = src; }
    catch (e1) {
      dateFolder.addFile(src);
      var parents = src.getParents();
      while (parents.hasNext()) {
        var p = parents.next();
        if (p.getId() !== dateFolder.getId()) {
          try { p.removeFile(src); } catch (ignore) {}
        }
      }
      out = src;
    }
  } else {
    out = src.makeCopy(src.getName(), dateFolder);
  }
  var dto = fileToDto_(out, categoryName);
  dto.docDate = normalizeDocDate_(docDate || todayStr_());
  return dto;
}

function trashDriveFile(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return true;
  } catch (e) {
    return false;
  }
}

function countCustomerFiles_(customerFolderId) {
  try {
    return listAllCustomerFiles(customerFolderId).length;
  } catch (e) {
    return 0;
  }
}

function folderExists_(folderId) {
  if (!folderId) return false;
  try {
    var f = DriveApp.getFolderById(String(folderId));
    return !!(f && !f.isTrashed());
  } catch (e) {
    return false;
  }
}

/**
 * 同步：Drive 上已刪／進垃圾桶的客戶資料夾 → 從 Sheets 索引移除
 * 有短快取，避免每次開啟都掃全部。
 * @param {{force?:boolean}} opt
 * @return {{removed:number, checked:number, ids:string[]}}
 */
function syncCustomersWithDrive_(opt) {
  opt = opt || {};
  if (!opt.force) {
    var cached = sharedGetJson_('driveSyncResult_v1');
    if (cached && cached.at && (Date.now() - cached.at) < 60000) {
      return cached.result || { removed: 0, checked: 0, ids: [] };
    }
  }

  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  var removedIds = [];
  var checked = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var id = String(row.id || '');
    var folderId = String(row.folderId || '');
    checked++;
    if (!folderId || !folderExists_(folderId)) {
      if (id) {
        deleteObjectById_(CONFIG.SHEETS.CUSTOMERS, id);
        removedIds.push(id);
        try {
          logActivity_(id, String(row.name || ''), 'sync_delete',
            'Drive 資料夾已刪除，同步移除索引 · ' + (row.name || ''));
        } catch (e) { /* ignore */ }
      }
    }
  }

  if (removedIds.length) {
    invalidateSheetCache_(CONFIG.SHEETS.CUSTOMERS);
  }

  var result = { removed: removedIds.length, checked: checked, ids: removedIds };
  sharedPutJson_('driveSyncResult_v1', { at: Date.now(), result: result }, 60);
  return result;
}

function getCategoryTemplate_() {
  var cached = cacheGet_('categories');
  if (cached && cached.length) return cached;
  var cats = getSetting('categories', null);
  if (!cats || !cats.length) {
    cats = (CONFIG.DEFAULT_CATEGORIES || []).slice();
  }
  if (typeof cats === 'string') {
    try { cats = JSON.parse(cats); } catch (e) { cats = (CONFIG.DEFAULT_CATEGORIES || []).slice(); }
  }
  if (!Array.isArray(cats) || !cats.length) {
    cats = (CONFIG.DEFAULT_CATEGORIES || []).slice();
  }
  cacheSet_('categories', cats);
  return cats;
}

function defaultDocCategory_(categories) {
  categories = categories || getCategoryTemplate_();
  for (var i = 0; i < categories.length; i++) {
    if (String(categories[i]).indexOf('保單') >= 0) return categories[i];
  }
  return categories[0] || (CONFIG.DEFAULT_DOC_CATEGORY_HINT || '02 保單');
}

function defaultFolderMeta_(categories) {
  categories = categories || getCategoryTemplate_();
  var meta = {};
  categories.forEach(function (cat) {
    meta[cat] = { done: false, count: 0 };
  });
  return meta;
}

function computeManualCompletion_(folderMeta, categories) {
  categories = categories && categories.length ? categories : getCategoryTemplate_();
  folderMeta = folderMeta && typeof folderMeta === 'object' ? folderMeta : {};
  var filled = 0;
  var checklist = [];
  categories.forEach(function (cat) {
    var m = folderMeta[cat] || {};
    var count = Number(m.count) || 0;
    var done = !!m.done || count > 0;
    if (done) filled++;
    checklist.push({ category: cat, done: done, count: count });
  });
  var total = categories.length || 1;
  var percent = Math.round((filled / total) * 100);
  return { percent: percent, filled: filled, total: categories.length, checklist: checklist };
}

function deriveStatus_(completion, forced) {
  if (forced === 'paused') return 'paused';
  completion = Number(completion) || 0;
  if (completion >= 100) return 'completed';
  if (completion > 0) return 'in_progress';
  return 'not_started';
}

function parseDriveFileId_(input) {
  var s = String(input || '').trim();
  if (!s) return '';
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return s;
  var m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return '';
}

function resolveDriveFile(input) {
  var id = parseDriveFileId_(input);
  if (!id) throw new Error('無法解析雲端檔案連結');
  var f = DriveApp.getFileById(id);
  return fileToDto_(f, '');
}

function searchDriveFiles(query, limit) {
  limit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  var q = String(query || '').trim();
  if (!q) return [];
  var files = DriveApp.searchFiles(
    "trashed = false and title contains '" + q.replace(/'/g, "\\'") + "'"
  );
  var out = [];
  while (files.hasNext() && out.length < limit) {
    out.push(fileToDto_(files.next(), ''));
  }
  return out;
}

function listDriveFolder(folderId) {
  var folder = folderId
    ? DriveApp.getFolderById(String(folderId))
    : DriveApp.getRootFolder();
  var folders = [];
  var files = [];
  var fit = folder.getFolders();
  while (fit.hasNext()) {
    var sub = fit.next();
    if (sub.isTrashed()) continue;
    folders.push({ id: sub.getId(), name: sub.getName() });
  }
  var fileIt = folder.getFiles();
  while (fileIt.hasNext()) {
    var f = fileIt.next();
    if (f.isTrashed()) continue;
    files.push(fileToDto_(f, ''));
  }
  return {
    folderId: folder.getId(),
    name: folder.getName(),
    folders: folders,
    files: files
  };
}

function getPickerConfig() {
  return {
    developerKey: '',
    clientId: '',
    appId: '',
    mimeTypes: CONFIG.SUPPORTED_EXT.map(function (e) { return '.' + e; }).join(','),
    note: '若未設定 Picker，請用「雲端硬碟連結」或瀏覽模式'
  };
}
