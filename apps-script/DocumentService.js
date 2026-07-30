/**
 * DriveDocs — Document upload / delete / open (Drive-backed)
 */

/**
 * Upload document to a customer category.
 * @param {Object} payload
 * @return {Object}
 */
function uploadDocument(payload) {
  var customerId = payload.customerId;
  var category = payload.category;
  var fileName = payload.fileName;
  var mimeType = payload.mimeType || 'application/octet-stream';
  var base64Data = payload.base64Data;

  if (!customerId) throw new Error('缺少客戶');
  if (!category) throw new Error('請選擇文件分類');
  if (!fileName || !base64Data) throw new Error('缺少檔案');

  var detail = getCustomer(customerId);
  var c = detail.customer;
  if (!c.folderId) throw new Error('客戶資料夾不存在');

  var file = uploadFileToCategory(c.folderId, category, fileName, mimeType, base64Data);
  var completion = computeCompletion(c.folderId);
  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    completion: completion.percent,
    updatedAt: nowIso_()
  });

  logActivity_(customerId, c.name, 'upload', '新增 ' + fileName);
  bumpReport_('organized', 1);
  bumpReport_('updates', 1);

  return { file: file, completion: completion };
}

/**
 * Delete (trash) a document in Drive.
 * @param {Object} payload
 * @return {Object}
 */
function deleteDocument(payload) {
  var customerId = payload.customerId;
  var fileId = payload.fileId;
  var fileName = payload.fileName || '文件';

  if (!fileId) throw new Error('缺少檔案');
  trashDriveFile(fileId);

  var completion = { percent: 0, filled: 0, total: 0, checklist: [] };
  if (customerId) {
    try {
      var detail = getCustomer(customerId);
      if (detail.customer.folderId) {
        completion = computeCompletion(detail.customer.folderId);
        updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
          completion: completion.percent,
          updatedAt: nowIso_()
        });
      }
      logActivity_(customerId, detail.customer.name, 'delete_file', '刪除 ' + fileName);
    } catch (e) { /* customer may be gone */ }
  }
  bumpReport_('updates', 1);
  return { ok: true, completion: completion };
}

/**
 * Refresh completion for one customer.
 * @param {string} customerId
 * @return {Object}
 */
function refreshCompletion(customerId) {
  var detail = getCustomer(customerId);
  if (!detail.customer.folderId) {
    return { percent: 0, filled: 0, total: getCategoryTemplate_().length, checklist: [] };
  }
  var completion = computeCompletion(detail.customer.folderId);
  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    completion: completion.percent
  });
  return completion;
}
