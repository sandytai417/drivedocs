/**
 * DriveDocs — Drive 資料夾層（日期分夾，無文件類型分類）
 * 路徑：客戶資料／客戶／{注音}／{客戶姓名}／{資料日期}／檔案
 * Drive 是資料庫：刪除 Drive 資料夾後，網站索引會同步清除。
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
 * 不再建立文件類型子資料夾。
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

  // 若注音改變，搬到正確注音資料夾
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

/** 客戶資料夾／{資料日期} */
function ensureDateFolder_(customerFolderId, docDate) {
  var dateName = normalizeDocDate_(docDate);
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  return findOrCreateSubfolder_(customerFolder, dateName);
}

/** 舊名相容：忽略 category，只建日期夾 */
function ensureCategoryDateFolder_(customerFolderId, category, docDate) {
  return ensureDateFolder_(customerFolderId, docDate);
}

function isDateFolderName_(name) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(name || ''));
}

/**
 * 列出客戶底下的日期資料夾（新）與舊版「分類／日期」結構中的日期。
 * @return {string[]} yyyy-MM-dd 降序
 */
function listCustomerDateKeys_(customerFolderId) {
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var dates = {};
  var subs = customerFolder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    if (sub.isTrashed()) continue;
    var name = sub.getName();
    if (name === 'metadata.json') continue;
    if (isDateFolderName_(name)) {
      dates[name] = true;
      continue;
    }
    // 舊結構：分類夾底下再放日期
    var nested = sub.getFolders();
    while (nested.hasNext()) {
      var d = nested.next();
      if (!d.isTrashed() && isDateFolderName_(d.getName())) {
        dates[d.getName()] = true;
      }
    }
  }
  return Object.keys(dates).sort(function (a, b) {
    return String(b).localeCompare(String(a));
  });
}

/**
 * 列出某日期資料夾內的檔案（相容舊：分類／日期／檔案）
 */
function listDateFiles(customerFolderId, docDate) {
  var dateName = normalizeDocDate_(docDate);
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var result = [];
  var seen = {};

  function pushFiles_(folder) {
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.isTrashed()) continue;
      if (f.getName() === 'metadata.json') continue;
      if (seen[f.getId()]) continue;
      seen[f.getId()] = true;
      var dto = fileToDto_(f, dateName);
      dto.docDate = dateName;
      result.push(dto);
    }
  }

  // 新結構：客戶／日期
  var direct = customerFolder.getFoldersByName(dateName);
  while (direct.hasNext()) {
    pushFiles_(direct.next());
  }

  // 舊結構：客戶／分類／日期
  var cats = customerFolder.getFolders();
  while (cats.hasNext()) {
    var cat = cats.next();
    if (cat.isTrashed() || isDateFolderName_(cat.getName())) continue;
    var dates = cat.getFoldersByName(dateName);
    while (dates.hasNext()) {
      pushFiles_(dates.next());
    }
  }

  result.sort(function (a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return result;
}

/** 舊 API 名：categoryName 現在當資料日期用 */
function listCategoryFiles(customerFolderId, categoryName) {
  if (isDateFolderName_(categoryName) || /^\d{4}/.test(String(categoryName || ''))) {
    return listDateFiles(customerFolderId, categoryName);
  }
  // 舊呼叫若仍傳分類名：回傳該分類下所有檔（相容）
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var subs = customerFolder.getFoldersByName(categoryName);
  if (!subs.hasNext()) return [];
  var cat = subs.next();
  var result = [];
  var dates = cat.getFolders();
  while (dates.hasNext()) {
    var d = dates.next();
    if (d.isTrashed()) continue;
    var files = d.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.isTrashed() || f.getName() === 'metadata.json') continue;
      var dto = fileToDto_(f, d.getName());
      dto.docDate = isDateFolderName_(d.getName()) ? d.getName() : '';
      result.push(dto);
    }
  }
  // 也可能檔案直接在分類夾
  var topFiles = cat.getFiles();
  while (topFiles.hasNext()) {
    var tf = topFiles.next();
    if (tf.isTrashed() || tf.getName() === 'metadata.json') continue;
    result.push(fileToDto_(tf, categoryName));
  }
  return result;
}

function listAllCustomerFiles(customerFolderId) {
  var dates = listCustomerDateKeys_(customerFolderId);
  var all = [];
  dates.forEach(function (d) {
    all = all.concat(listDateFiles(customerFolderId, d));
  });
  return all;
}

/** 依日期分組 */
function listCustomerFilesGrouped_(customerFolderId) {
  var dates = listCustomerDateKeys_(customerFolderId);
  var grouped = {};
  dates.forEach(function (d) {
    grouped[d] = listDateFiles(customerFolderId, d);
  });
  return grouped;
}

function fileToDto_(f, dateOrCategory) {
  return {
    id: f.getId(),
    name: f.getName(),
    mimeType: f.getMimeType(),
    size: f.getSize(),
    url: f.getUrl(),
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + f.getId(),
    previewUrl: 'https://drive.google.com/file/d/' + f.getId() + '/view',
    category: dateOrCategory || '',
    docDate: isDateFolderName_(dateOrCategory) ? dateOrCategory : '',
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
  var dateFolder = ensureDateFolder_(customerFolderId, docDate || todayStr_());
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', fileName);
  var file = dateFolder.createFile(blob);
  var dto = fileToDto_(file, normalizeDocDate_(docDate || todayStr_()));
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
  var dateFolder = ensureDateFolder_(customerFolderId, docDate || todayStr_());
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
  var dto = fileToDto_(out, normalizeDocDate_(docDate || todayStr_()));
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

/** 無分類模式：不再回傳文件類型模板 */
function getCategoryTemplate_() {
  return [];
}

function defaultDocCategory_(categories) {
  return '';
}

function defaultFolderMeta_(categories) {
  return {};
}

function computeManualCompletion_(folderMeta, categories) {
  var dates = folderMeta && typeof folderMeta === 'object' ? Object.keys(folderMeta) : [];
  var filled = 0;
  var checklist = [];
  dates.forEach(function (d) {
    var m = folderMeta[d] || {};
    var count = Number(m.count) || 0;
    var done = !!m.done || count > 0;
    if (done) filled++;
    checklist.push({ category: d, date: d, done: done, count: count });
  });
  var total = dates.length || 1;
  var percent = dates.length ? Math.round((filled / total) * 100) : (filled ? 100 : 0);
  return { percent: percent, filled: filled, total: dates.length, checklist: checklist };
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
