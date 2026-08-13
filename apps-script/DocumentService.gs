/**
 * DriveDocs — 文件上傳／刪除／從雲端匯入（直寫 Drive）
 */

function uploadDocument(payload) {
  payload = payload || {};
  var customerId = payload.customerId;
  var category = payload.category || '保單';
  var fileName = payload.fileName;
  var mimeType = payload.mimeType || 'application/octet-stream';
  var base64Data = payload.base64Data;
  var docDate = normalizeDocDate_(payload.docDate || payload.dataDate || payload.date);

  if (!customerId) throw new Error('缺少客戶');
  if (!category) category = '保單';
  if (!fileName || !base64Data) throw new Error('缺少檔案');

  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  if (!c.folderId) throw new Error('客戶資料夾不存在');

  var file = uploadFileToCategory(c.folderId, category, fileName, mimeType, base64Data, docDate);
  // 上傳後直接 +1，避免重掃整個 Drive 資料夾（以前這裡會卡住很久）
  var fileCount = (Number(c.fileCount) || 0) + 1;
  var meta = bumpFolderMetaCount_(c.folderMeta || {}, category, 1);
  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    fileCount: fileCount,
    folderMeta: JSON.stringify(meta),
    updatedAt: nowIso_()
  });
  c.fileCount = fileCount;
  c.folderMeta = meta;
  c.policyFileCount = policyFileCountFromMeta_(meta);
  c.isRenewal = isRenewalFromMeta_(meta);
  c.updatedAt = nowIso_();

  logActivity_(customerId, c.name, 'upload', '上傳新文件 · ' + c.name + ' · ' + category + '／' + docDate + ' · ' + fileName);
  bumpReport_('organized', 1);
  bumpReport_('updates', 1);

  return { file: file, customer: c };
}

/**
 * 從既有 Google 雲端硬碟檔案匯入（預設移動；可改複製／捷徑）
 */
function importDocument(payload) {
  payload = payload || {};
  var customerId = payload.customerId;
  var category = payload.category || '保單';
  var mode = payload.mode === 'copy' ? 'copy' : (payload.mode === 'shortcut' ? 'shortcut' : 'move');
  var fileId = payload.fileId || parseDriveFileId_(payload.driveUrl || payload.url || '');
  var docDate = normalizeDocDate_(payload.docDate || payload.dataDate || payload.date);

  if (!customerId) throw new Error('缺少客戶');
  if (!category) category = '保單';
  if (!fileId) throw new Error('請提供雲端檔案連結或檔案 ID');

  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  if (!c.folderId) throw new Error('客戶資料夾不存在');

  var file = importDriveFileToCategory(c.folderId, category, fileId, mode, docDate);
  var fileCount = (Number(c.fileCount) || 0) + 1;
  var meta = bumpFolderMetaCount_(c.folderMeta || {}, category, 1);
  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    fileCount: fileCount,
    folderMeta: JSON.stringify(meta),
    updatedAt: nowIso_()
  });
  c.fileCount = fileCount;
  c.folderMeta = meta;
  c.policyFileCount = policyFileCountFromMeta_(meta);
  c.isRenewal = isRenewalFromMeta_(meta);
  c.updatedAt = nowIso_();

  var verb = mode === 'move' ? '移動雲端文件' : (mode === 'shortcut' ? '建立雲端捷徑' : '匯入雲端文件');
  logActivity_(customerId, c.name, 'import_drive', verb + ' · ' + c.name + ' · ' + category + '／' + docDate + ' · ' + file.name);
  bumpReport_('organized', 1);
  bumpReport_('updates', 1);

  return { file: file, customer: c, mode: mode };
}

/**
 * 批次本機檔案上傳：讀客戶一次、寫回試算表一次、避免 N 次 round-trip
 * payload.items: [{ category, fileName, mimeType, base64Data, docDate }, ...]
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
  var folderCache = {}; // key: category|docDate → dateFolder（同批多檔重用）

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var category = it.category || '保單';
    var fileName = it.fileName;
    var base64Data = it.base64Data;
    var docDate = normalizeDocDate_(it.docDate || it.dataDate || it.date);
    try {
      if (!fileName || !base64Data) throw new Error('缺少檔案');
      validateUpload_(fileName, it.mimeType);
      var key = docDate;
      var dateFolder = folderCache[key];
      if (!dateFolder) {
        dateFolder = ensureDateFolder_(c.folderId, docDate);
        folderCache[key] = dateFolder;
      }
      var bytes = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(bytes, it.mimeType || 'application/octet-stream', fileName);
      var dto = fileToDto_(dateFolder.createFile(blob), category);
      dto.docDate = docDate;
      results.push({ ok: true, file: dto, name: fileName, category: category });
      fileCount++;
      meta = bumpFolderMetaCount_(meta, category, 1);
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
  c.policyFileCount = policyFileCountFromMeta_(meta);
  c.isRenewal = isRenewalFromMeta_(meta);
  c.updatedAt = nowIso_();

  var okList = results.filter(function (r) { return r.ok; });
  logActivity_(customerId, c.name, 'upload_bulk',
    '批次上傳 ' + okList.length + ' 個檔案 · ' + c.name);
  bumpReport_('organized', okList.length);
  bumpReport_('updates', okList.length);

  return { results: results, customer: c };
}

/**
 * 批次雲端匯入：讀客戶一次、寫回試算表一次
 * payload.items: [{ category, fileId, mode, docDate, fileName }, ...]
 */
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
    var category = it.category || '保單';
    var mode = it.mode === 'copy' ? 'copy' : (it.mode === 'shortcut' ? 'shortcut' : 'move');
    var fileId = it.fileId || parseDriveFileId_(it.driveUrl || it.url || '');
    var docDate = normalizeDocDate_(it.docDate || it.dataDate || it.date);
    try {
      if (!fileId) throw new Error('缺少雲端檔案');
      var src = DriveApp.getFileById(String(fileId));
      if (src.isTrashed()) throw new Error('該檔案已在垃圾桶');
      if (src.getMimeType() === 'application/vnd.google-apps.folder') {
        throw new Error('請選擇檔案（不支援整個資料夾）');
      }

      var key = docDate;
      var dateFolder = folderCache[key];
      if (!dateFolder) {
        dateFolder = ensureDateFolder_(c.folderId, docDate);
        folderCache[key] = dateFolder;
      }

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
      var dto = fileToDto_(out, category);
      dto.docDate = docDate;
      results.push({ ok: true, file: dto, name: dto.name, category: category, mode: mode });
      fileCount++;
      meta = bumpFolderMetaCount_(meta, category, 1);
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
  c.policyFileCount = policyFileCountFromMeta_(meta);
  c.isRenewal = isRenewalFromMeta_(meta);
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
  if (!fileId) throw new Error('缺少檔案');

  trashDriveFile(fileId);

  if (customerId) {
    try {
      var detail = getCustomer(customerId, { skipFiles: true });
      var c = detail.customer;
      var fileCount = Math.max(0, (Number(c.fileCount) || 0) - 1);
      var meta = c.folderMeta || {};
      if (payload.category) {
        meta = bumpFolderMetaCount_(meta, payload.category, -1);
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
