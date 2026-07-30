/**
 * DriveDocs — Google Drive folder & file operations
 * All documents live in Drive. The web app never stores file copies.
 */

/**
 * Get or create the root「客戶資料」folder.
 * @return {Folder}
 */
function getRootFolder_() {
  var id = getProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // recreate
    }
  }
  var name = getSetting('rootFolderName', CONFIG.DEFAULT_ROOT_NAME);
  var folders = DriveApp.getFoldersByName(name);
  var folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(name);
  }
  setProp_(CONFIG.PROP_KEYS.ROOT_FOLDER_ID, folder.getId());
  return folder;
}

/**
 * Category template from settings.
 * @return {string[]}
 */
function getCategoryTemplate_() {
  var cats = getSetting('categories', null);
  if (cats && cats.length) return cats;
  return CONFIG.DEFAULT_CATEGORIES.slice();
}

/**
 * Create customer folder tree:
 * 客戶資料 / 王大明 / 01 基本資料 ... + metadata.json
 * @param {string} customerName
 * @param {Object} metadata
 * @return {{folderId: string, categoryIds: Object}}
 */
function createCustomerFolderTree(customerName, metadata) {
  var root = getRootFolder_();
  var existing = root.getFoldersByName(customerName);
  var customerFolder;
  if (existing.hasNext()) {
    customerFolder = existing.next();
  } else {
    customerFolder = root.createFolder(customerName);
  }

  var categories = getCategoryTemplate_();
  var categoryIds = {};
  categories.forEach(function (cat) {
    var sub = findOrCreateSubfolder_(customerFolder, cat);
    categoryIds[cat] = sub.getId();
  });

  writeMetadata_(customerFolder, metadata || {});

  return {
    folderId: customerFolder.getId(),
    categoryIds: categoryIds
  };
}

/**
 * @param {Folder} parent
 * @param {string} name
 * @return {Folder}
 */
function findOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

/**
 * Write / overwrite metadata.json in customer folder.
 * @param {Folder} folder
 * @param {Object} metadata
 */
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

/**
 * Rename customer folder when name changes.
 * @param {string} folderId
 * @param {string} newName
 */
function renameCustomerFolder(folderId, newName) {
  var folder = DriveApp.getFolderById(folderId);
  folder.setName(newName);
}

/**
 * Trash customer folder (and contents).
 * @param {string} folderId
 */
function trashCustomerFolder(folderId) {
  try {
    DriveApp.getFolderById(folderId).setTrashed(true);
  } catch (e) {
    // already gone
  }
}

/**
 * List files in a category subfolder.
 * @param {string} customerFolderId
 * @param {string} categoryName
 * @return {Object[]}
 */
function listCategoryFiles(customerFolderId, categoryName) {
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var subs = customerFolder.getFoldersByName(categoryName);
  if (!subs.hasNext()) return [];
  var cat = subs.next();
  var files = cat.getFiles();
  var result = [];
  while (files.hasNext()) {
    var f = files.next();
    if (f.isTrashed()) continue;
    result.push(fileToDto_(f, categoryName));
  }
  result.sort(function (a, b) {
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return result;
}

/**
 * List all files across categories for a customer.
 * @param {string} customerFolderId
 * @return {Object[]}
 */
function listAllCustomerFiles(customerFolderId) {
  var categories = getCategoryTemplate_();
  var all = [];
  categories.forEach(function (cat) {
    all = all.concat(listCategoryFiles(customerFolderId, cat));
  });
  return all;
}

/**
 * @param {File} f
 * @param {string} category
 * @return {Object}
 */
function fileToDto_(f, category) {
  return {
    id: f.getId(),
    name: f.getName(),
    mimeType: f.getMimeType(),
    size: f.getSize(),
    url: f.getUrl(),
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + f.getId(),
    previewUrl: 'https://drive.google.com/file/d/' + f.getId() + '/view',
    category: category,
    updatedAt: Utilities.formatDate(f.getLastUpdated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss"),
    createdAt: Utilities.formatDate(f.getDateCreated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss")
  };
}

/**
 * Upload a file (base64) into a customer category folder.
 * Website does NOT keep a copy — bytes go straight to Drive.
 * @param {string} customerFolderId
 * @param {string} categoryName
 * @param {string} fileName
 * @param {string} mimeType
 * @param {string} base64Data
 * @return {Object}
 */
function uploadFileToCategory(customerFolderId, categoryName, fileName, mimeType, base64Data) {
  validateUpload_(fileName, mimeType);
  var customerFolder = DriveApp.getFolderById(customerFolderId);
  var cat = findOrCreateSubfolder_(customerFolder, categoryName);
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType, fileName);
  var file = cat.createFile(blob);
  return fileToDto_(file, categoryName);
}

/**
 * @param {string} fileName
 * @param {string} mimeType
 */
function validateUpload_(fileName, mimeType) {
  var ext = String(fileName).split('.').pop().toLowerCase();
  if (CONFIG.SUPPORTED_EXT.indexOf(ext) === -1) {
    throw new Error('不支援的檔案格式：.' + ext + '（僅支援 PDF / JPG / PNG / DOCX / XLSX）');
  }
  if (mimeType && !CONFIG.SUPPORTED_MIME[mimeType]) {
    // allow if extension is ok (browsers sometimes send odd mime)
    if (CONFIG.SUPPORTED_EXT.indexOf(ext) === -1) {
      throw new Error('不支援的檔案類型');
    }
  }
}

/**
 * Trash a Drive file by id.
 * @param {string} fileId
 * @return {boolean}
 */
function trashDriveFile(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Compute completion: categories that have ≥1 file / total categories.
 * @param {string} customerFolderId
 * @return {{percent: number, filled: number, total: number, checklist: Object[]}}
 */
function computeCompletion(customerFolderId) {
  var categories = getCategoryTemplate_();
  var checklist = [];
  var filled = 0;
  categories.forEach(function (cat) {
    var files = listCategoryFiles(customerFolderId, cat);
    var ok = files.length > 0;
    if (ok) filled++;
    checklist.push({ category: cat, done: ok, count: files.length });
  });
  var percent = categories.length ? Math.round((filled / categories.length) * 100) : 0;
  return { percent: percent, filled: filled, total: categories.length, checklist: checklist };
}
