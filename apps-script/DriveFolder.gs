/**
 * DriveDocs — Drive 資料夾層
 * 路徑：千婷-整理客戶資料／{注音}／{客戶姓名}／{民國日期}／檔案
 * 例：千婷-整理客戶資料／ㄉ／戴**／1150813
 * 畫面只顯示「保單」一張卡；Drive 不建分類夾。
 */

function findOrCreateSubfolder_(parent, name) {
  name = String(name || '').trim();
  if (!name) throw new Error('資料夾名稱不可空白');
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function findUntrashedFolderByName_(name) {
  name = String(name || '').trim();
  if (!name) return null;
  try {
    var it = DriveApp.getFoldersByName(name);
    while (it.hasNext()) {
      var f = it.next();
      try {
        if (f && !f.isTrashed()) return f;
      } catch (e) { /* skip */ }
    }
  } catch (e2) { /* ignore */ }
  return null;
}

function rememberRootFolder_(folder) {
  if (!folder) return folder;
  try { setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, folder.getId()); } catch (e) {}
  return folder;
}

function wantedCustomerRootName_(useSettings) {
  var wanted = (CONFIG && CONFIG.DEFAULT_ROOT_NAME) || '千婷-整理客戶資料';
  var legacy = (CONFIG && CONFIG.LEGACY_ROOT_NAME) || '客戶資料';
  if (useSettings) {
    try {
      var saved = String(getSetting('rootFolderName', wanted) || '').trim();
      if (saved && saved !== legacy) wanted = saved;
    } catch (e) { /* keep default */ }
  }
  return wanted;
}

function resolveCustomerRootFolder_(useSettings) {
  var wanted = wantedCustomerRootName_(useSettings);
  var legacy = (CONFIG && CONFIG.LEGACY_ROOT_NAME) || '客戶資料';

  var named = findUntrashedFolderByName_(wanted);
  if (named) {
    try {
      if (useSettings) {
        var cur = String(getSetting('rootFolderName', '') || '').trim();
        if (!cur || cur === legacy) setSetting('rootFolderName', wanted);
      }
    } catch (e0) {}
    return rememberRootFolder_(named);
  }

  var id = '';
  try { id = getProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID) || ''; } catch (e1) { id = ''; }
  if (id) {
    try {
      var existing = DriveApp.getFolderById(id);
      if (existing && !existing.isTrashed()) {
        try {
          if (existing.getName() === legacy && wanted !== legacy) existing.setName(wanted);
        } catch (e2) {}
        try {
          if (useSettings) setSetting('rootFolderName', wanted);
        } catch (e3) {}
        return existing;
      }
    } catch (e4) {
      try { setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, ''); } catch (ignore) {}
    }
  }

  var old = findUntrashedFolderByName_(legacy);
  if (old && wanted !== legacy) {
    try { old.setName(wanted); } catch (e5) {}
    try { if (useSettings) setSetting('rootFolderName', wanted); } catch (e6) {}
    return rememberRootFolder_(old);
  }

  var created = DriveApp.createFolder(wanted);
  try { if (useSettings) setSetting('rootFolderName', wanted); } catch (e7) {}
  return rememberRootFolder_(created);
}

function getRootFolder_() {
  return resolveCustomerRootFolder_(true);
}

/** 客戶資料（不再多一層「客戶」） */
function getCustomersBucketFolder_() {
  return getRootFolder_();
}

function resolveZhuyinKey_(customerName) {
  var z = '';
  try { z = String(getZhuyinInitial(customerName) || '').trim(); } catch (e) { z = ''; }
  return z || '#';
}

function findNamedChildFolder_(parent, name) {
  if (!parent) return null;
  name = String(name || '').trim();
  if (!name) return null;
  try {
    var it = parent.getFoldersByName(name);
    while (it.hasNext()) {
      var f = it.next();
      try { if (!f.isTrashed()) return f; } catch (e) { continue; }
    }
  } catch (e2) { /* ignore */ }
  return null;
}

function getImmediateParentFolder_(folder) {
  try {
    var it = folder.getParents();
    if (it.hasNext()) return it.next();
  } catch (e) { /* ignore */ }
  return null;
}

/** 把 src 內檔案／子夾併進 dest（同名子夾遞迴合併） */
function mergeFolderContents_(src, dest) {
  if (!src || !dest || src.getId() === dest.getId()) return;
  var fileIt = src.getFiles();
  while (fileIt.hasNext()) {
    var f = fileIt.next();
    try { f.moveTo(dest); }
    catch (e) {
      try { dest.addFile(f); } catch (e2) { /* ignore */ }
      try { src.removeFile(f); } catch (e3) { /* ignore */ }
    }
  }
  var folderIt = src.getFolders();
  var subs = [];
  while (folderIt.hasNext()) subs.push(folderIt.next());
  for (var i = 0; i < subs.length; i++) {
    var sub = subs[i];
    try { if (sub.isTrashed()) continue; } catch (e4) { continue; }
    var clash = findNamedChildFolder_(dest, sub.getName());
    if (clash && clash.getId() !== sub.getId()) {
      mergeFolderContents_(sub, clash);
      try { sub.setTrashed(true); } catch (e5) { /* ignore */ }
    } else {
      try { sub.moveTo(dest); }
      catch (e6) {
        try { dest.addFolder(sub); src.removeFolder(sub); } catch (e7) { /* ignore */ }
      }
    }
  }
}

function moveFolderInto_(folder, destParent) {
  if (!folder || !destParent) return folder;
  if (folder.getId() === destParent.getId()) return folder;
  var destId = destParent.getId();
  var clash = findNamedChildFolder_(destParent, folder.getName());
  if (clash && clash.getId() !== folder.getId()) {
    mergeFolderContents_(folder, clash);
    try { folder.setTrashed(true); } catch (e0) { /* ignore */ }
    return clash;
  }
  var extras = [];
  var already = false;
  try {
    var parents = folder.getParents();
    while (parents.hasNext()) {
      var p = parents.next();
      if (p.getId() === destId) already = true;
      else extras.push(p);
    }
  } catch (e1) { /* ignore */ }
  if (!already) {
    try { folder.moveTo(destParent); }
    catch (e2) {
      try { destParent.addFolder(folder); } catch (e3) { throw e2; }
    }
  }
  for (var i = 0; i < extras.length; i++) {
    try { extras[i].removeFolder(folder); } catch (ignore) {}
  }
  return folder;
}

function looksLikeCustomerFolder_(folder) {
  if (!folder) return false;
  var name = String(folder.getName() || '').trim();
  if (!name || name === '客戶') return false;
  if (isZhuyinKeyFolder_(name) || isDateFolderName_(name)) return false;
  try {
    if (folder.getFilesByName('metadata.json').hasNext()) return true;
  } catch (e) { /* ignore */ }
  try {
    var subs = folder.getFolders();
    while (subs.hasNext()) {
      var sub = subs.next();
      try {
        if (!sub.isTrashed() && isDateFolderName_(sub.getName())) return true;
      } catch (e2) { continue; }
    }
  } catch (e3) { /* ignore */ }
  return false;
}

/**
 * 保證姓名夾在 千婷-整理客戶資料／{注音}／{姓名}。
 * 會把舊路徑 客戶／注音／姓名，以及誤放在根目錄／姓名 的夾搬進去。
 */
function ensureFolderUnderZhuyin_(folderId, customerName, metadata) {
  customerName = String(customerName || '').trim();
  if (!customerName) throw new Error('客戶姓名不可空白');
  var folder = null;
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(String(folderId));
      if (folder && folder.isTrashed()) folder = null;
    } catch (e) { folder = null; }
  }
  var fname = folder ? String(folder.getName() || '').trim() : '';
  if (folder && (isZhuyinKeyFolder_(fname) || fname === '客戶' || isDateFolderName_(fname))) {
    folder = null;
    fname = '';
  }
  if (!folder) return createCustomerFolderTree(customerName, metadata || { name: customerName });
  if (fname !== customerName) {
    try { folder.setName(customerName); } catch (e2) { /* keep */ }
  }
  var root = getRootFolder_();
  var zhuyin = resolveZhuyinKey_(customerName);
  var zhFolder = findOrCreateSubfolder_(root, zhuyin);
  folder = moveFolderInto_(folder, zhFolder);
  if (metadata) {
    try { writeMetadata_(folder, metadata); } catch (e3) { /* ignore */ }
  }
  return { folderId: folder.getId(), zhuyin: zhuyin };
}

/**
 * 建立客戶資料夾：千婷-整理客戶資料／{注音}／{姓名}
 * 舊夾若在 客戶／注音／姓名 或 根目錄／姓名，會搬到正確注音夾。
 */
function createCustomerFolderTree(customerName, metadata) {
  customerName = String(customerName || '').trim();
  if (!customerName) throw new Error('客戶姓名不可空白');
  var root = getRootFolder_();
  var zhuyin = resolveZhuyinKey_(customerName);
  var zhFolder = findOrCreateSubfolder_(root, zhuyin);

  var customerFolder = findNamedChildFolder_(zhFolder, customerName);
  if (!customerFolder) {
    var oldBucket = findNamedChildFolder_(root, '客戶');
    if (oldBucket) {
      var oldZh = findNamedChildFolder_(oldBucket, zhuyin);
      if (oldZh) customerFolder = findNamedChildFolder_(oldZh, customerName);
      if (!customerFolder) {
        var inBucket = findNamedChildFolder_(oldBucket, customerName);
        if (inBucket && !isZhuyinKeyFolder_(customerName) && !isDateFolderName_(customerName)) {
          customerFolder = inBucket;
        }
      }
    }
  }
  if (!customerFolder) {
    var direct = findNamedChildFolder_(root, customerName);
    if (direct && customerName !== '客戶' && !isZhuyinKeyFolder_(customerName) && !isDateFolderName_(customerName)) {
      customerFolder = direct;
    }
  }
  if (!customerFolder) {
    var zhs = root.getFolders();
    while (zhs.hasNext() && !customerFolder) {
      var zf = zhs.next();
      try { if (zf.isTrashed()) continue; } catch (eSkip) { continue; }
      if (!isZhuyinKeyFolder_(zf.getName()) || zf.getId() === zhFolder.getId()) continue;
      customerFolder = findNamedChildFolder_(zf, customerName);
    }
  }
  if (!customerFolder) customerFolder = zhFolder.createFolder(customerName);
  else customerFolder = moveFolderInto_(customerFolder, zhFolder);

  try { writeMetadata_(customerFolder, metadata || {}); } catch (eMeta) { /* 夾已建好即可 */ }
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
  newName = String(newName || '').trim();
  if (!newName) return folderId;
  var tree = ensureFolderUnderZhuyin_(folderId, newName);
  var id = (tree && tree.folderId) ? tree.folderId : folderId;
  try {
    var folder = DriveApp.getFolderById(String(id));
    if (folder.getName() !== newName) folder.setName(newName);
  } catch (e) { /* ignore */ }
  return id;
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

/** 客戶底下有幾個不重複的日期資料夾（兩個以上＝續保） */
function countDateFoldersIn_(folder) {
  var seen = {};
  if (!folder) return 0;
  try {
    var it = folder.getFolders();
    while (it.hasNext()) {
      var sub = it.next();
      try {
        if (sub.isTrashed()) continue;
        var name = String(sub.getName() || '');
        if (isDateFolderName_(name)) {
          seen[name] = true;
          continue;
        }
        var nested = sub.getFolders();
        while (nested.hasNext()) {
          var d = nested.next();
          try {
            if (!d.isTrashed() && isDateFolderName_(d.getName())) {
              seen[String(d.getName())] = true;
            }
          } catch (e2) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e3) { /* ignore */ }
  return Object.keys(seen).length;
}

function stampCustomerDateCount_(customerFolderId, folderMeta) {
  folderMeta = folderMeta && typeof folderMeta === 'object' ? folderMeta : {};
  try {
    var folder = DriveApp.getFolderById(String(customerFolderId));
    folderMeta.dateCount = countDateFoldersIn_(folder);
  } catch (e) {
    if (folderMeta.dateCount == null) folderMeta.dateCount = 0;
  }
  return folderMeta;
}

function dateCountByFolderId_() {
  var folders = listCustomerFoldersFromDriveCached_(false) || [];
  var map = {};
  for (var i = 0; i < folders.length; i++) {
    var id = String(folders[i].folderId || '').trim();
    if (id) map[id] = Number(folders[i].dateCount) || 0;
  }
  return map;
}

function invalidateDriveIndexCaches_() {
  try { cacheDel_('driveFolders_v1'); } catch (e) { /* ignore */ }
  try { sharedRemove_('driveFolders_v1'); } catch (e2) { /* ignore */ }
  try { sharedRemove_('driveSyncResult_v1'); } catch (e3) { /* ignore */ }
  try { cacheDel_('homePayload_v8'); } catch (e4) { /* ignore */ }
  try { sharedRemove_('homePayload_v8'); } catch (e5) { /* ignore */ }
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
  return tree;
}

function isZhuyinKeyFolder_(name) {
  name = String(name || '').trim();
  if (!name || name === '客戶') return false;
  if (name === '#') return true;
  if (typeof ZHUYIN_ORDER !== 'undefined' && ZHUYIN_ORDER.indexOf(name) >= 0) return true;
  return /^[ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ]$/.test(name);
}

function migrateOneCustomerFolder_(folder, root) {
  if (!folder || !root) return false;
  var name = String(folder.getName() || '').trim();
  if (!name) return false;
  var zhFolder = findOrCreateSubfolder_(root, resolveZhuyinKey_(name));
  var parent = getImmediateParentFolder_(folder);
  if (parent && parent.getId() === zhFolder.getId()) return false;
  moveFolderInto_(folder, zhFolder);
  return true;
}

function shouldMigrateNameFolder_(folder, name, knownNames) {
  if (knownNames && knownNames[name]) return true;
  return looksLikeCustomerFolder_(folder);
}

/** 把誤放在 根目錄／姓名 或 客戶／… 的姓名夾搬進 千婷-整理客戶資料／注音／姓名 */
function migrateCustomerFoldersIntoZhuyin_() {
  var root = getRootFolder_();
  var moved = 0;
  var knownNames = {};
  try {
    var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
    for (var r = 0; r < rows.length; r++) {
      var nm = String(rows[r].name || '').trim();
      if (nm) knownNames[nm] = true;
    }
  } catch (eSheet) { /* ignore */ }

  var oldBucket = findNamedChildFolder_(root, '客戶');
  if (oldBucket) {
    var bucketKids = [];
    var bit = oldBucket.getFolders();
    while (bit.hasNext()) bucketKids.push(bit.next());
    for (var i = 0; i < bucketKids.length; i++) {
      var child = bucketKids[i];
      try { if (child.isTrashed()) continue; } catch (e) { continue; }
      var cn = String(child.getName() || '');
      if (isZhuyinKeyFolder_(cn)) {
        var names = [];
        var nit = child.getFolders();
        while (nit.hasNext()) names.push(nit.next());
        for (var n = 0; n < names.length; n++) {
          try {
            if (!names[n].isTrashed() && migrateOneCustomerFolder_(names[n], root)) moved++;
          } catch (e2) { /* ignore */ }
        }
      } else if (!isDateFolderName_(cn) && shouldMigrateNameFolder_(child, cn, knownNames)) {
        try {
          if (migrateOneCustomerFolder_(child, root)) moved++;
        } catch (e3) { /* ignore */ }
      }
    }
  }

  var rootKids = [];
  var rit = root.getFolders();
  while (rit.hasNext()) rootKids.push(rit.next());
  for (var d = 0; d < rootKids.length; d++) {
    var rk = rootKids[d];
    try { if (rk.isTrashed()) continue; } catch (e4) { continue; }
    var rn = String(rk.getName() || '');
    if (rn === '客戶' || isZhuyinKeyFolder_(rn) || isDateFolderName_(rn)) continue;
    if (shouldMigrateNameFolder_(rk, rn, knownNames)) {
      try {
        if (migrateOneCustomerFolder_(rk, root)) moved++;
      } catch (e5) { /* ignore */ }
    }
  }
  return moved;
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
      var dateCount = 0;
      try { dateCount = countDateFoldersIn_(cust); } catch (e3) { dateCount = 0; }
      out.push({
        name: cname,
        zhuyin: zhName,
        folderId: cust.getId(),
        dateCount: dateCount
      });
    }
  }
}

/** 只收錄 千婷-整理客戶資料／{注音}／{姓名}（以及尚未搬移的舊路徑 客戶／注音／姓名） */
function listCustomerFoldersFromDrive_(opt) {
  opt = opt || {};
  if (opt.migrate) {
    try { migrateCustomerFoldersIntoZhuyin_(); } catch (eMig) { /* 搬夾失敗仍列出目前位置 */ }
  }
  var out = [];
  var root = getRootFolder_();
  collectCustomerFoldersUnder_(root, out);
  try {
    var oldIt = root.getFoldersByName('客戶');
    if (oldIt.hasNext()) collectCustomerFoldersUnder_(oldIt.next(), out);
  } catch (e) { /* ignore */ }
  try {
    var legacyName = (CONFIG && CONFIG.LEGACY_ROOT_NAME) || '客戶資料';
    if (root && root.getName() !== legacyName) {
      var oldRoot = findUntrashedFolderByName_(legacyName);
      if (oldRoot && oldRoot.getId() !== root.getId()) {
        collectCustomerFoldersUnder_(oldRoot, out);
        try {
          var oldBucket = oldRoot.getFoldersByName('客戶');
          if (oldBucket.hasNext()) collectCustomerFoldersUnder_(oldBucket.next(), out);
        } catch (eB) { /* ignore */ }
      }
    }
  } catch (eL) { /* ignore */ }
  return out;
}

function cacheLiveFolderIds_(ids) {
  var clean = [];
  (ids || []).forEach(function (id) {
    id = String(id || '').trim();
    if (id) clean.push(id);
  });
  sharedPutJson_('liveFolderIds_v1', { ids: clean, at: Date.now() }, 30);
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

function listCustomerFoldersFromDriveCached_(force) {
  if (!force) {
    var mem = cacheGet_('driveFolders_v1');
    if (mem && mem.folders) return mem.folders;
    var cached = sharedGetJson_('driveFolders_v1');
    if (cached && cached.folders && cached.at && (Date.now() - cached.at) < 20000) {
      cacheSet_('driveFolders_v1', cached);
      return cached.folders;
    }
  }
  var folders = listCustomerFoldersFromDrive_({ migrate: !!force });
  var wrapped = { folders: folders, at: Date.now() };
  cacheSet_('driveFolders_v1', wrapped);
  sharedPutJson_('driveFolders_v1', wrapped, 30);
  return folders;
}

/**
 * 客戶列表只收錄最近一次 Drive 掃描仍存在的資料夾。
 * 沒有掃描結果時不顯示（避免試算表殘列被當成客戶）。
 */
function filterRowsWithDriveFolder_(rows) {
  rows = rows || [];
  var idSet = liveFolderIdSet_();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var fid = String(rows[i].folderId || '').trim();
    if (!fid) continue;
    if (!idSet || !idSet[fid]) continue;
    out.push(rows[i]);
  }
  return out;
}

function rewriteCustomersSheet_(objects) {
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(15000);
  } catch (eLock) { lock = null; }
  try {
    var sh = getSheet_(CONFIG.SHEETS.CUSTOMERS);
    var lastCol = 1;
    try { lastCol = Math.max(1, sh.getLastColumn()); } catch (e) { lastCol = (CONFIG.CUSTOMER_HEADERS || []).length || 1; }
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    if (!headers || !headers.length || !String(headers[0] || '').trim()) {
      headers = (CONFIG.CUSTOMER_HEADERS || []).slice();
    }
    var values = [headers];
    for (var i = 0; i < (objects || []).length; i++) {
      var obj = objects[i] || {};
      var row = [];
      for (var j = 0; j < headers.length; j++) {
        var h = headers[j];
        if (!h) {
          row.push('');
          continue;
        }
        var v = obj[h];
        if (v === undefined || v === null) row.push('');
        else if (Object.prototype.toString.call(v) === '[object Date]') row.push(v);
        else if (typeof v === 'object') row.push(JSON.stringify(v));
        else row.push(v);
      }
      values.push(row);
    }
    sh.clearContents();
    sh.getRange(1, 1, values.length, headers.length).setValues(values);
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eRel) { /* ignore */ }
    }
  }
}

/**
 * 以 Drive 為準同步索引：掃描 千婷-整理客戶資料／{注音}／{姓名}（含舊路徑 客戶／注音／姓名）。
 * Drive 沒有的列從列表移除；Drive 有的夾才進入列表。
 * @param {{force?:boolean}} opt
 */
function syncCustomersWithDrive_(opt) {
  opt = opt || {};
  if (!opt.force) {
    var cached = sharedGetJson_('driveSyncResult_v1');
    if (cached && cached.at && (Date.now() - cached.at) < 20000) {
      return cached.result || { removed: 0, checked: 0, imported: 0, ids: [] };
    }
  }

  var driveFolders = listCustomerFoldersFromDriveCached_(!!opt.force);
  var liveIds = [];
  var byDriveId = {};
  for (var d = 0; d < driveFolders.length; d++) {
    var df = driveFolders[d];
    var dfId = String(df.folderId || '').trim();
    var dfName = String(df.name || '').trim();
    if (!dfId || !dfName) continue;
    liveIds.push(dfId);
    byDriveId[dfId] = df;
  }
  cacheLiveFolderIds_(liveIds);

  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  var byFolderId = {};
  var byName = {};
  for (var r = 0; r < rows.length; r++) {
    var fid = String(rows[r].folderId || '').trim();
    var nm = String(rows[r].name || '').trim();
    if (fid) byFolderId[fid] = rows[r];
    if (nm && !byName[nm]) byName[nm] = rows[r];
  }

  var used = {};
  var out = [];
  var imported = 0;
  var dateCountChanged = false;
  var now = nowIso_();
  var folderMeta = JSON.stringify(defaultFolderMeta_(getCategoryTemplate_()));

  for (d = 0; d < driveFolders.length; d++) {
    df = driveFolders[d];
    dfId = String(df.folderId || '').trim();
    dfName = String(df.name || '').trim();
    if (!dfId || !dfName) continue;

    var existing = byFolderId[dfId];
    if (!existing && byName[dfName] && !used[String(byName[dfName].id || '')]) {
      existing = byName[dfName];
    }

    if (existing) {
      used[String(existing.id || '')] = true;
      existing.folderId = dfId;
      existing.name = dfName;
      existing.zhuyin = df.zhuyin || existing.zhuyin || '';
      var metaObj = {};
      try { metaObj = parseJsonSafe_(existing.folderMeta, {}) || {}; } catch (eMeta) { metaObj = {}; }
      if (!metaObj || typeof metaObj !== 'object') metaObj = {};
      var nextDates = Number(df.dateCount) || 0;
      if (Number(metaObj.dateCount) !== nextDates) {
        metaObj.dateCount = nextDates;
        existing.folderMeta = JSON.stringify(metaObj);
        dateCountChanged = true;
      }
      out.push(existing);
    } else {
      imported++;
      var newMeta = {};
      try { newMeta = parseJsonSafe_(folderMeta, {}) || {}; } catch (eNew) { newMeta = {}; }
      if (!newMeta || typeof newMeta !== 'object') newMeta = defaultFolderMeta_(getCategoryTemplate_());
      newMeta.dateCount = Number(df.dateCount) || 0;
      out.push({
        id: newId_(),
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
        folderMeta: JSON.stringify(newMeta),
        createdAt: now,
        updatedAt: now,
        completion: 0,
        status: 'not_started',
        fileCount: 0,
        zhuyin: df.zhuyin || ''
      });
    }
  }

  var removedIds = [];
  for (r = 0; r < rows.length; r++) {
    var rid = String(rows[r].id || '');
    if (rid && !used[rid]) removedIds.push(rid);
  }

  if (removedIds.length || imported || dateCountChanged) {
    rewriteCustomersSheet_(out);
    invalidateSheetCache_(CONFIG.SHEETS.CUSTOMERS);
    cacheLiveFolderIds_(liveIds);
  }

  var result = {
    removed: removedIds.length,
    checked: driveFolders.length,
    imported: imported,
    ids: removedIds
  };
  sharedPutJson_('driveSyncResult_v1', { at: Date.now(), result: result }, 20);
  return result;
}

function ensureDriveIndexSynced_(force) {
  return syncCustomersWithDrive_({ force: !!force });
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
