/**
 * DriveDocs — Drive 資料夾層
 * 路徑：客戶資料／{注音}／{客戶姓名}／{民國日期}／檔案
 * 例：客戶資料／ㄉ／戴**／1150813
 * 畫面只顯示「保單」一張卡；Drive 不建分類夾。
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

/** 客戶資料（不再多一層「客戶」） */
function getCustomersBucketFolder_() {
  return getRootFolder_();
}

/**
 * 建立客戶資料夾：客戶資料／{注音}／{姓名}
 * 相容舊路徑：客戶資料／客戶／{注音}／{姓名}
 */
function createCustomerFolderTree(customerName, metadata) {
  var root = getRootFolder_();
  var zhuyin = getZhuyinInitial(customerName);
  var zhFolder = findOrCreateSubfolder_(root, zhuyin);
  var existing = zhFolder.getFoldersByName(customerName);
  var customerFolder = null;
  if (existing.hasNext()) {
    customerFolder = existing.next();
  } else {
    var oldBucketIt = root.getFoldersByName('客戶');
    if (oldBucketIt.hasNext()) {
      var oldZhIt = oldBucketIt.next().getFoldersByName(zhuyin);
      if (oldZhIt.hasNext()) {
        var oldCustIt = oldZhIt.next().getFoldersByName(customerName);
        if (oldCustIt.hasNext()) customerFolder = oldCustIt.next();
      }
    }
    if (!customerFolder) customerFolder = zhFolder.createFolder(customerName);
  }
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
    var bucket = grandParents.hasNext() ? grandParents.next() : getRootFolder_();
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

function isRocDateFolderName_(name) {
  var s = String(name || '');
  if (/^\d{7}$/.test(s)) {
    var y = Number(s.slice(0, 3));
    var mo = Number(s.slice(3, 5));
    var d = Number(s.slice(5, 7));
    return y >= 1 && y <= 200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  }
  if (/^\d{6}$/.test(s)) {
    var y2 = Number(s.slice(0, 2));
    var mo2 = Number(s.slice(2, 4));
    var d2 = Number(s.slice(4, 6));
    return y2 >= 1 && y2 <= 99 && mo2 >= 1 && mo2 <= 12 && d2 >= 1 && d2 <= 31;
  }
  return false;
}

function isDateFolderName_(name) {
  var s = String(name || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || isRocDateFolderName_(s);
}

/** 客戶／{民國日期} 例如 1150813；相容舊西元資料夾 */
function ensureDateFolder_(customerFolderId, docDate) {
  var ymd = normalizeDocDate_(docDate);
  var roc = typeof rocFolderNameFromYmd_ === 'function' ? rocFolderNameFromYmd_(ymd) : ymd.replace(/-/g, '');
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var rocIt = customerFolder.getFoldersByName(roc);
  if (rocIt.hasNext()) return rocIt.next();
  var ymdIt = customerFolder.getFoldersByName(ymd);
  if (ymdIt.hasNext()) return ymdIt.next();
  return customerFolder.createFolder(roc);
}

/** 舊名相容：忽略分類，只建日期夾 */
function ensureCategoryDateFolder_(customerFolderId, category, docDate) {
  return ensureDateFolder_(customerFolderId, docDate);
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
 * 列出客戶所有檔案（日期夾；相容舊「分類／日期」）
 */
function listAllCustomerFiles(customerFolderId) {
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var result = [];
  var seen = {};
  var subs = customerFolder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    if (sub.isTrashed()) continue;
    var name = sub.getName();
    if (isDateFolderName_(name)) {
      pushFolderFiles_(sub, '保單', name, result, seen);
      continue;
    }
    var nested = sub.getFolders();
    var hadDate = false;
    while (nested.hasNext()) {
      var d = nested.next();
      if (d.isTrashed()) continue;
      if (isDateFolderName_(d.getName())) {
        hadDate = true;
        pushFolderFiles_(d, '保單', d.getName(), result, seen);
      }
    }
    if (!hadDate) {
      pushFolderFiles_(sub, '保單', '', result, seen);
    }
  }
  pushFolderFiles_(customerFolder, '保單', '', result, seen);
  result.sort(function (a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return result;
}

/** 畫面只有保單：點開即列出全部檔案 */
function listCategoryFiles(customerFolderId, categoryName) {
  return listAllCustomerFiles(customerFolderId);
}

function listCustomerFilesGrouped_(customerFolderId) {
  return { '保單': listAllCustomerFiles(customerFolderId) };
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
  var dateFolder = ensureDateFolder_(customerFolderId, docDate || todayStr_());
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', fileName);
  var file = dateFolder.createFile(blob);
  var dto = fileToDto_(file, categoryName || '保單');
  dto.docDate = typeof rocFolderNameFromYmd_ === 'function'
    ? rocFolderNameFromYmd_(docDate || todayStr_())
    : normalizeDocDate_(docDate || todayStr_());
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

function requireLiveCustomerFolder_(tree, customerName) {
  var name = String(customerName || '').trim() || '客戶';
  if (!tree || !String(tree.folderId || '').trim()) {
    throw new Error('無法在 Drive 建立「' + name + '」資料夾，未寫入客戶列表');
  }
  if (!folderExists_(tree.folderId)) {
    throw new Error('Drive 裡找不到「' + name + '」資料夾，未寫入客戶列表');
  }
  return tree;
}

function isZhuyinKeyFolder_(name) {
  name = String(name || '').trim();
  if (!name || name === '#' || name === '客戶') return false;
  if (typeof ZHUYIN_ORDER !== 'undefined' && ZHUYIN_ORDER.indexOf(name) >= 0) return true;
  return /^[ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ]$/.test(name);
}

function collectCustomerFoldersUnder_(parent, out) {
  if (!parent) return;
  var zhs = parent.getFolders();
  while (zhs.hasNext()) {
    var zhFolder = zhs.next();
    try {
      if (zhFolder.isTrashed()) continue;
    } catch (e) { continue; }
    var zhName = String(zhFolder.getName() || '');
    if (!isZhuyinKeyFolder_(zhName)) continue;
    var kids = zhFolder.getFolders();
    while (kids.hasNext()) {
      var cust = kids.next();
      try {
        if (cust.isTrashed()) continue;
      } catch (e2) { continue; }
      var cname = String(cust.getName() || '').trim();
      if (!cname) continue;
      out.push({
        name: cname,
        zhuyin: zhName,
        folderId: cust.getId()
      });
    }
  }
}

/** 只收錄 客戶資料／{注音}／{姓名}（含舊路徑 客戶資料／客戶／{注音}／{姓名}） */
function listCustomerFoldersFromDrive_() {
  var out = [];
  var root = getRootFolder_();
  collectCustomerFoldersUnder_(root, out);
  try {
    var oldIt = root.getFoldersByName('客戶');
    if (oldIt.hasNext()) collectCustomerFoldersUnder_(oldIt.next(), out);
  } catch (e) { /* ignore */ }
  return out;
}

function cacheLiveFolderIds_(ids) {
  var clean = [];
  (ids || []).forEach(function (id) {
    id = String(id || '').trim();
    if (id) clean.push(id);
  });
  sharedPutJson_('liveFolderIds_v1', { ids: clean, at: Date.now() }, 600);
}

function liveFolderIdSet_() {
  var live = sharedGetJson_('liveFolderIds_v1');
  if (!live || !live.ids || !live.ids.length) return null;
  var set = {};
  for (var i = 0; i < live.ids.length; i++) {
    var id = String(live.ids[i] || '').trim();
    if (id) set[id] = true;
  }
  return set;
}

/**
 * 客戶列表只收錄「Drive 資料夾 id 存在」的列。
 * 若剛同步過，再對齊實際仍在 Drive 的夾；沒有同步快取時不掃 Drive（保持載入速度）。
 */
function filterRowsWithDriveFolder_(rows) {
  rows = rows || [];
  var idSet = liveFolderIdSet_();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var fid = String(rows[i].folderId || '').trim();
    if (!fid) continue;
    if (idSet && !idSet[fid]) continue;
    out.push(rows[i]);
  }
  return out;
}

/**
 * 同步：Drive 沒有的夾 → 從索引移除；Drive 裡真實的姓名夾 → 才加入列表。
 * 不虛構客戶。有短快取，避免每次開啟都掃全部。
 * @param {{force?:boolean}} opt
 * @return {{removed:number, checked:number, imported:number, ids:string[]}}
 */
function syncCustomersWithDrive_(opt) {
  opt = opt || {};
  if (!opt.force) {
    var cached = sharedGetJson_('driveSyncResult_v1');
    if (cached && cached.at && (Date.now() - cached.at) < 60000) {
      return cached.result || { removed: 0, checked: 0, imported: 0, ids: [] };
    }
  }

  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  var removedIds = [];
  var checked = 0;
  var liveIds = [];

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
    } else {
      liveIds.push(folderId);
    }
  }

  var imported = 0;
  var driveFolders = [];
  try { driveFolders = listCustomerFoldersFromDrive_(); } catch (eWalk) { driveFolders = []; }

  var remaining = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  var byFolderId = {};
  var byName = {};
  for (var r = 0; r < remaining.length; r++) {
    var fid2 = String(remaining[r].folderId || '').trim();
    var nm = String(remaining[r].name || '').trim();
    if (fid2) byFolderId[fid2] = true;
    if (nm) byName[nm] = true;
  }

  var now = nowIso_();
  var folderMeta = JSON.stringify(defaultFolderMeta_(getCategoryTemplate_()));
  for (var d = 0; d < driveFolders.length; d++) {
    var df = driveFolders[d];
    var dfId = String(df.folderId || '').trim();
    var dfName = String(df.name || '').trim();
    if (!dfId || !dfName) continue;
    if (byFolderId[dfId] || byName[dfName]) continue;
    var newId = newId_();
    appendObject_(CONFIG.SHEETS.CUSTOMERS, {
      id: newId,
      name: dfName,
      phone: '',
      email: '',
      birthday: '',
      gender: '',
      idNumber: '',
      address: '',
      tags: '[]',
      notes: '',
      folderId: dfId,
      folderMeta: folderMeta,
      createdAt: now,
      updatedAt: now,
      completion: 0,
      status: 'not_started',
      fileCount: 0,
      zhuyin: df.zhuyin || (typeof getZhuyinInitial === 'function' ? getZhuyinInitial(dfName) : '')
    });
    byFolderId[dfId] = true;
    byName[dfName] = true;
    liveIds.push(dfId);
    imported++;
    try {
      logActivity_(newId, dfName, 'sync_import', '從 Drive 資料夾加入客戶列表 · ' + dfName);
    } catch (e3) { /* ignore */ }
  }

  if (removedIds.length || imported) {
    invalidateSheetCache_(CONFIG.SHEETS.CUSTOMERS);
  }

  cacheLiveFolderIds_(liveIds);

  var result = {
    removed: removedIds.length,
    checked: checked,
    imported: imported,
    ids: removedIds
  };
  sharedPutJson_('driveSyncResult_v1', { at: Date.now(), result: result }, 60);
  return result;
}

function getCategoryTemplate_() {
  return ['保單'];
}

function defaultDocCategory_(categories) {
  return '保單';
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
