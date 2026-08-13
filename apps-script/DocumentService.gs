/**
 * DriveDocs — 文件上傳／刪除／從雲端匯入（直寫 Drive · 只依資料日期分夾）
 */

function uploadDocument(payload) {
  payload = payload || {};
  var customerId = payload.customerId;
  var fileName = payload.fileName;
  var mimeType = payload.mimeType || 'application/octet-stream';
  var base64Data = payload.base64Data;
  var docDate = normalizeDocDate_(payload.docDate || payload.dataDate || payload.date || todayStr_());

  if (!customerId) throw new Error('缺少客戶');
  if (!fileName || !base64Data) throw new Error('缺少檔案');

  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  if (!c.folderId) throw new Error('客戶資料夾不存在');

  var file = uploadFileToCategory(c.folderId, '', fileName, mimeType, base64Data, docDate);
  var fileCount = (Number(c.fileCount) || 0) + 1;
  var meta = bumpFolderMetaCount_(c.folderMeta || {}, docDate, 1);
  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    fileCount: fileCount,
    folderMeta: JSON.stringify(meta),
    updatedAt: nowIso_()
  });
  c.fileCount = fileCount;
  c.folderMeta = meta;
  c.isRenewal = isRenewalFromMeta_(meta) || isRenewalFromCount_(fileCount);
  c.updatedAt = nowIso_();

  logActivity_(customerId, c.name, 'upload',
    '上傳新文件 · ' + c.name + ' · ' + docDate + ' · ' + fileName);
  bumpReport_('organized', 1);
  bumpReport_('updates', 1);

  return { file: file, customer: c };
}

function importDocument(payload) {
  payload = payload || {};
  var customerId = payload.customerId;
  var mode = payload.mode === 'copy' ? 'copy' : (payload.mode === 'shortcut' ? 'shortcut' : 'move');
  var fileId = payload.fileId || parseDriveFileId_(payload.driveUrl || payload.url || '');
  var docDate = normalizeDocDate_(payload.docDate || payload.dataDate || payload.date || todayStr_());

  if (!customerId) throw new Error('缺少客戶');
  if (!fileId) throw new Error('請提供雲端檔案連結或檔案 ID');

  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  if (!c.folderId) throw new Error('客戶資料夾不存在');

  var file = importDriveFileToCategory(c.folderId, '', fileId, mode, docDate);
  var fileCount = (Number(c.fileCount) || 0) + 1;
  var meta = bumpFolderMetaCount_(c.folderMeta || {}, docDate, 1);
  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    fileCount: fileCount,
    folderMeta: JSON.stringify(meta),
    updatedAt: nowIso_()
  });
  c.fileCount = fileCount;
  c.folderMeta = meta;
  c.isRenewal = isRenewalFromMeta_(meta) || isRenewalFromCount_(fileCount);
  c.updatedAt = nowIso_();

  var verb = mode === 'move' ? '移動雲端文件' : (mode === 'shortcut' ? '建立雲端捷徑' : '匯入雲端文件');
  logActivity_(customerId, c.name, 'import_drive',
    verb + ' · ' + c.name + ' · ' + docDate + ' · ' + file.name);
  bumpReport_('organized', 1);
  bumpReport_('updates', 1);

  return { file: file, customer: c, mode: mode };
}

/**
 * 批次本機上傳：讀客戶一次、寫回試算表一次、同日期資料夾快取重用
 * payload.items: [{ fileName, mimeType, base64Data, docDate }, ...]
 */
function uploadDocuments(payload) {
  payload = payload || {};
  var customerId = payload.customerId;
  var items = Array.isArray(payload.items) ? payload.items : [];
  if (!customerId) throw new Error('缺少客戶');
  if (!items.length) throw new Error('請先選檔案');

  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  if (!c.folderId) throw new Error('客戶資料夾不存在');

  var meta = c.folderMeta || {};
  var fileCount = Number(c.fileCount) || 0;
  var results = [];
  var folderCache = {}; // docDate → dateFolder

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var fileName = it.fileName;
    var base64Data = it.base64Data;
    var docDate = normalizeDocDate_(it.docDate || it.dataDate || it.date || todayStr_());
    try {
      if (!fileName || !base64Data) throw new Error('缺少檔案');
      validateUpload_(fileName, it.mimeType);
      var dateFolder = folderCache[docDate];
      if (!dateFolder) {
        dateFolder = ensureDateFolder_(c.folderId, docDate);
        folderCache[docDate] = dateFolder;
      }
      var bytes = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(bytes, it.mimeType || 'application/octet-stream', fileName);
      var dto = fileToDto_(dateFolder.createFile(blob), docDate);
      dto.docDate = docDate;
      results.push({ ok: true, file: dto, name: fileName, docDate: docDate });
      fileCount++;
      meta = bumpFolderMetaCount_(meta, docDate, 1);
    } catch (e) {
      results.push({ ok: false, name: fileName || '(未命名)', error: String(e.message || e) });
    }
  }

  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    fileCount: fileCount,
    folderMeta: JSON.stringify(meta),
    updatedAt: nowIso_()
  });
  c.fileCount = fileCount;
  c.folderMeta = meta;
  c.isRenewal = isRenewalFromMeta_(meta) || isRenewalFromCount_(fileCount);
  c.updatedAt = nowIso_();

  var okList = results.filter(function (r) { return r.ok; });
  logActivity_(customerId, c.name, 'upload_bulk',
    '批次上傳 ' + okList.length + ' 個檔案 · ' + c.name);
  bumpReport_('organized', okList.length);
  bumpReport_('updates', okList.length);

  return { results: results, customer: c };
}

function importDocuments(payload) {
  payload = payload || {};
  var customerId = payload.customerId;
  var items = Array.isArray(payload.items) ? payload.items : [];
  if (!customerId) throw new Error('缺少客戶');
  if (!items.length) throw new Error('請先選檔案');

  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  if (!c.folderId) throw new Error('客戶資料夾不存在');

  var meta = c.folderMeta || {};
  var fileCount = Number(c.fileCount) || 0;
  var results = [];
  var folderCache = {};

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var mode = it.mode === 'copy' ? 'copy' : (it.mode === 'shortcut' ? 'shortcut' : 'move');
    var fileId = it.fileId || parseDriveFileId_(it.driveUrl || it.url || '');
    var docDate = normalizeDocDate_(it.docDate || it.dataDate || it.date || todayStr_());
    try {
      if (!fileId) throw new Error('缺少雲端檔案');
      var dateFolder = folderCache[docDate];
      if (!dateFolder) {
        dateFolder = ensureDateFolder_(c.folderId, docDate);
        folderCache[docDate] = dateFolder;
      }
      var dto = importDriveFileToCategory(c.folderId, '', fileId, mode, docDate);
      results.push({ ok: true, file: dto, name: dto.name, docDate: docDate, mode: mode });
      fileCount++;
      meta = bumpFolderMetaCount_(meta, docDate, 1);
    } catch (e) {
      results.push({ ok: false, name: it.fileName || fileId || '(未命名)', error: String(e.message || e) });
    }
  }

  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    fileCount: fileCount,
    folderMeta: JSON.stringify(meta),
    updatedAt: nowIso_()
  });
  c.fileCount = fileCount;
  c.folderMeta = meta;
  c.isRenewal = isRenewalFromMeta_(meta) || isRenewalFromCount_(fileCount);
  c.updatedAt = nowIso_();

  var okList = results.filter(function (r) { return r.ok; });
  logActivity_(customerId, c.name, 'import_bulk',
    '批次匯入雲端 ' + okList.length + ' 個檔案 · ' + c.name);
  bumpReport_('organized', okList.length);
  bumpReport_('updates', okList.length);

  return { results: results, customer: c };
}

function deleteDocument(payload) {
  payload = payload || {};
  var customerId = payload.customerId;
  var fileId = payload.fileId;
  var fileName = payload.fileName || '文件';
  var docDate = payload.docDate || '';
  if (!fileId) throw new Error('缺少檔案');

  trashDriveFile(fileId);

  if (customerId) {
    try {
      var detail = getCustomer(customerId, { skipFiles: true });
      var c = detail.customer;
      var fileCount = Math.max(0, (Number(c.fileCount) || 0) - 1);
      var meta = c.folderMeta || {};
      if (docDate) {
        meta = bumpFolderMetaCount_(meta, docDate, -1);
      }
      updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
        fileCount: fileCount,
        folderMeta: JSON.stringify(meta),
        updatedAt: nowIso_()
      });
      logActivity_(customerId, c.name, 'delete_file', '刪除文件 · ' + fileName);
    } catch (e) { /* ignore */ }
  }
  bumpReport_('updates', 1);
  return { ok: true };
}
