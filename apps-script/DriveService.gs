/**
 * DriveDocs — 客戶 CRUD（含手動完成度、續保、進階搜尋）
 * 請整份覆蓋 Apps Script 的 DriveService.gs（不要只貼一段）。
 * 正確貼上後，檔案最後一行應為：// END DriveService.gs
 */

/** 是否為「保單」文件類型 */
function isPolicyCategory_(name) {
  return String(name || '').indexOf('保單') >= 0;
}

/** 保單檔案數 */
function policyFileCountFromMeta_(folderMeta) {
  folderMeta = folderMeta || {};
  var n = 0;
  Object.keys(folderMeta).forEach(function (k) {
    if (k === 'dateCount') return;
    if (isPolicyCategory_(k)) n += Number(folderMeta[k].count) || 0;
  });
  return n;
}

/** 續保：客戶底下有兩個或以上日期資料夾 */
function isRenewalFromDateCount_(dateCount) {
  return Number(dateCount) >= 2;
}

function isRenewalFromMeta_(folderMeta) {
  folderMeta = folderMeta || {};
  return isRenewalFromDateCount_(folderMeta.dateCount);
}

function applyRenewalFromDrive_(customers) {
  customers = customers || [];
  var map = {};
  try { map = dateCountByFolderId_(); } catch (e) { map = {}; }
  for (var i = 0; i < customers.length; i++) {
    var id = String(customers[i].folderId || '').trim();
    if (id && map[id] != null) {
      customers[i].dateCount = map[id];
      customers[i].isRenewal = isRenewalFromDateCount_(map[id]);
    } else {
      customers[i].isRenewal = isRenewalFromMeta_(customers[i].folderMeta);
    }
  }
  return customers;
}

function persistCustomerStats_(customerId, fileCount, meta) {
  meta = meta || {};
  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    fileCount: fileCount,
    folderMeta: JSON.stringify(meta),
    updatedAt: nowIso_()
  });
  try { invalidateDriveIndexCaches_(); } catch (e) { /* ignore */ }
}

function finishUploadStats_(c, fileCount, meta) {
  c.fileCount = fileCount;
  c.folderMeta = meta;
  c.dateCount = Number(meta.dateCount) || 0;
  c.policyFileCount = policyFileCountFromMeta_(meta);
  c.isRenewal = isRenewalFromDateCount_(c.dateCount) || isRenewalFromMeta_(meta);
  c.updatedAt = nowIso_();
}

function bumpFolderMetaCount_(folderMeta, category, delta) {
  folderMeta = folderMeta || {};
  category = String(category || '').trim();
  if (!category) return folderMeta;
  if (!folderMeta[category]) {
    folderMeta[category] = { done: false, count: 0 };
  }
  folderMeta[category].count = Math.max(0, (Number(folderMeta[category].count) || 0) + Number(delta || 0));
  return folderMeta;
}

function customerFromRow_(row, opts) {
  opts = opts || {};
  var light = !!opts.light;
  var tags = parseJsonSafe_(row.tags, []);
  if (typeof tags === 'string') {
    tags = tags.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
  }
  if (!Array.isArray(tags)) tags = [];

  var categories = opts.categories || getCategoryTemplate_();
  var folderMeta = parseJsonSafe_(row.folderMeta, null) || defaultFolderMeta_(categories);
  categories.forEach(function (cat) {
    if (!folderMeta[cat]) folderMeta[cat] = { done: false, count: 0 };
  });

  var completion = Number(row.completion);
  if (isNaN(completion)) {
    completion = computeManualCompletion_(folderMeta, categories).percent;
  }
  var fileCount = Number(row.fileCount) || 0;
  var name = String(row.name || '');

  var out = {
    id: String(row.id),
    name: name,
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    birthday: normalizeBirthday_(row.birthday || ''),
    gender: String(row.gender || ''),
    idNumber: String(row.idNumber || ''),
    address: String(row.address || ''),
    tags: light ? [] : tags,
    notes: light ? '' : String(row.notes || ''),
    folderId: String(row.folderId || ''),
    folderMeta: folderMeta,
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || ''),
    completion: completion,
    status: String(row.status || deriveStatus_(completion)),
    fileCount: fileCount,
    policyFileCount: policyFileCountFromMeta_(folderMeta),
    dateCount: Number((folderMeta && folderMeta.dateCount) || row.dateCount) || 0,
    zhuyin: String(row.zhuyin || getZhuyinInitial(name)),
    givenZhuyin: light ? '' : getGivenNameZhuyin(name)
  };
  out.isRenewal = isRenewalFromDateCount_(out.dateCount);
  // 列表／首頁：拿掉 folderMeta，大幅縮小 JSON（完成度已算好；續保已算好）
  if (opts.compact) {
    delete out.tags;
    delete out.notes;
    delete out.givenZhuyin;
  }
  return out;
}

/** 首頁／列表用：先算 typeStats 再 compact */
function customerFromRowCompact_(row, categories) {
  return customerFromRow_(row, { categories: categories, light: true, compact: true });
}

function listCustomers(sortBy) {
  sortBy = sortBy || 'zhuyin';
  try { ensureDriveIndexSynced_(false); } catch (e) { /* keep */ }
  var categories = getCategoryTemplate_();
  var rows = filterRowsWithDriveFolder_(sheetToObjects_(CONFIG.SHEETS.CUSTOMERS)).map(function (r) {
    return customerFromRow_(r, { categories: categories, light: true, compact: true });
  });
  applyRenewalFromDrive_(rows);
  if (sortBy === 'updated') {
    rows.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  } else if (sortBy === 'completion') {
    rows.sort(function (a, b) { return b.completion - a.completion; });
  } else {
    rows.sort(function (a, b) { return compareByZhuyin(a.name, b.name); });
  }
  return {
    customers: rows,
    groups: null,
    sortBy: sortBy,
    initials: ZHUYIN_ORDER.filter(function (z) { return z !== '#'; })
  };
}

function getCustomer(id, opts) {
  opts = opts || {};
  var skipFiles = opts.skipFiles !== false;
  if (opts.skipFiles === false) skipFiles = false;
  var categories = getCategoryTemplate_();
  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  var row = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) {
      row = rows[i];
      break;
    }
  }
  if (!row) throw new Error('找不到客戶：' + id);

  var c = customerFromRow_(row, { categories: categories, light: !!opts.light });
  if (opts.withNotes || opts.light) {
    c.notes = String(row.notes || '');
    c.tags = parseJsonSafe_(row.tags, []);
  }
  c.policyFileCount = policyFileCountFromMeta_(c.folderMeta);
  if (c.folderId) {
    try {
      c.folderMeta = stampCustomerDateCount_(c.folderId, c.folderMeta || {});
      c.dateCount = Number(c.folderMeta.dateCount) || 0;
    } catch (eDate) { /* keep */ }
  }
  c.isRenewal = isRenewalFromDateCount_(c.dateCount) || isRenewalFromMeta_(c.folderMeta);

  var filesByCategory = {};
  var cat;
  for (var k = 0; k < categories.length; k++) {
    filesByCategory[categories[k]] = [];
  }

  var filesLoaded = false;
  if (!skipFiles && c.folderId) {
    filesByCategory = listCustomerFilesGrouped_(c.folderId);
    var fileCount = 0;
    for (k = 0; k < categories.length; k++) {
      cat = categories[k];
      var files = filesByCategory[cat] || [];
      filesByCategory[cat] = files;
      fileCount += files.length;
      if (c.folderMeta[cat]) c.folderMeta[cat].count = files.length;
    }
    c.fileCount = fileCount;
    filesLoaded = true;
  }

  return {
    customer: c,
    categories: categories,
    filesByCategory: filesByCategory,
    folderMeta: c.folderMeta,
    filesLoaded: filesLoaded
  };
}

/** 點開某一分類才載檔（詳情加速關鍵） */
function listCustomerCategoryFiles(customerId, categoryName) {
  var detail = getCustomer(customerId, { skipFiles: true, light: true });
  var c = detail.customer;
  if (!c.folderId) {
    return { customerId: customerId, category: categoryName, files: [] };
  }
  var files = listCategoryFiles(c.folderId, categoryName);
  return {
    customerId: customerId,
    category: categoryName,
    files: files
  };
}

function pickCustomerName_(data) {
  if (data == null) return '';
  if (typeof data === 'string' || typeof data === 'number') {
    var direct = String(data).trim();
    return (direct && direct !== 'null' && direct !== 'undefined') ? direct : '';
  }
  var candidates = [
    data.customerName,
    data.name,
    data.fullName,
    data['姓名'],
    data.Name,
    data.customer_name
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] == null) continue;
    if (typeof candidates[i] === 'object') continue;
    var n = String(candidates[i]).trim();
    if (n && n !== 'null' && n !== 'undefined' && n !== '[object Object]') return n;
  }
  return '';
}

function relocateIndexedCustomer_(customer) {
  if (!customer || !customer.name) return customer;
  var tree = ensureFolderUnderZhuyin_(customer.folderId, customer.name, {
    id: customer.id,
    name: customer.name
  });
  if (!tree || !tree.folderId) return customer;
  var changed = String(tree.folderId) !== String(customer.folderId || '') ||
    String(tree.zhuyin || '') !== String(customer.zhuyin || '');
  customer.folderId = tree.folderId;
  customer.zhuyin = tree.zhuyin || customer.zhuyin || '';
  if (changed && customer.id) {
    try {
      updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customer.id, {
        folderId: tree.folderId,
        zhuyin: customer.zhuyin,
        updatedAt: nowIso_()
      });
    } catch (e) { /* keep in-memory */ }
  }
  try {
    var live = sharedGetJson_('liveFolderIds_v1');
    if (live && live.ids && live.ids.length) {
      var ids = live.ids.slice();
      if (ids.indexOf(String(tree.folderId)) === -1) ids.push(String(tree.folderId));
      cacheLiveFolderIds_(ids);
    }
  } catch (eLive) { /* ignore */ }
  return customer;
}

/**
 * 依 id 或姓名取得客戶；沒有就建立。UI 不必再分「既有／新增」模式。
 */
function ensureCustomer(data) {
  if (typeof data === 'string') data = { name: data, customerName: data };
  data = data || {};

  var id = data.id || data.customerId || '';
  if (id) {
    try {
      return relocateIndexedCustomer_(getCustomer(String(id)).customer);
    } catch (e) {
      // id 無效時改走姓名
    }
  }

  var name = pickCustomerName_(data);
  if (!name) {
    throw new Error('請填寫客戶姓名');
  }

  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].name) === name) {
      return relocateIndexedCustomer_(customerFromRow_(rows[i]));
    }
  }
  return createCustomer(data);
}

function createCustomer(data) {
  if (typeof data === 'string') data = { name: data, customerName: data };
  data = data || {};
  var name = pickCustomerName_(data);
  if (!name) {
    var keys = [];
    try { keys = Object.keys(data); } catch (e) { keys = []; }
    throw new Error('請輸入客戶姓名（未收到 name／customerName；欄位：' + (keys.join(', ') || '無') + '）');
  }

  var existing = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].name) === name) {
      var existingFid = String(existing[i].folderId || '').trim();
      if (existingFid && folderExists_(existingFid)) {
        return relocateIndexedCustomer_(customerFromRow_(existing[i]));
      }
      var rebuilt = requireLiveCustomerFolder_(
        createCustomerFolderTree(name, { id: String(existing[i].id), name: name }),
        name
      );
      updateObjectById_(CONFIG.SHEETS.CUSTOMERS, existing[i].id, {
        folderId: rebuilt.folderId,
        zhuyin: rebuilt.zhuyin || getZhuyinInitial(name),
        updatedAt: nowIso_()
      });
      var refreshed = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
      for (var j = 0; j < refreshed.length; j++) {
        if (String(refreshed[j].id) === String(existing[i].id)) {
          return customerFromRow_(refreshed[j]);
        }
      }
      return customerFromRow_(existing[i]);
    }
  }

  var id = newId_();
  var now = nowIso_();
  var categories = getCategoryTemplate_();
  if (!categories || !categories.length) {
    categories = CONFIG.DEFAULT_CATEGORIES.slice();
  }
  var folderMeta = defaultFolderMeta_(categories);
  var meta = {
    id: id,
    name: name,
    phone: data.phone || '',
    email: data.email || '',
    birthday: normalizeBirthday_(data.birthday || ''),
    gender: data.gender || '',
    idNumber: data.idNumber || '',
    address: data.address || '',
    tags: data.tags || [],
    notes: data.notes || '',
    createdAt: now
  };

  var tree = requireLiveCustomerFolder_(createCustomerFolderTree(name, meta), name);
  var row = {
    id: id,
    name: name,
    phone: data.phone || '',
    email: data.email || '',
    birthday: normalizeBirthday_(data.birthday || ''),
    gender: data.gender || '',
    idNumber: data.idNumber || '',
    address: data.address || '',
    tags: JSON.stringify(data.tags || []),
    notes: data.notes || '',
    folderId: tree.folderId,
    folderMeta: JSON.stringify(folderMeta),
    createdAt: now,
    updatedAt: now,
    completion: 0,
    status: 'not_started',
    fileCount: 0,
    zhuyin: tree.zhuyin || getZhuyinInitial(name)
  };
  appendObject_(CONFIG.SHEETS.CUSTOMERS, row);
  logActivity_(id, name, 'create_customer', '新增客戶 · ' + name);
  bumpReport_('newCustomers', 1);
  bumpReport_('updates', 1);
  return customerFromRow_(row);
}

function updateCustomer(id, data) {
  var detail = getCustomer(id);
  var c = detail.customer;
  var patch = { updatedAt: nowIso_() };

  if (data.name !== undefined) {
    var newName = String(data.name).trim();
    if (!newName) throw new Error('請輸入客戶姓名');
    if (newName !== c.name && c.folderId) {
      var relocatedId = renameCustomerFolder(c.folderId, newName);
      if (relocatedId) patch.folderId = relocatedId;
    }
    patch.name = newName;
    patch.zhuyin = getZhuyinInitial(newName);
  }
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.email !== undefined) patch.email = data.email;
  if (data.birthday !== undefined) patch.birthday = normalizeBirthday_(data.birthday);
  if (data.gender !== undefined) patch.gender = data.gender;
  if (data.idNumber !== undefined) patch.idNumber = data.idNumber;
  if (data.address !== undefined) patch.address = data.address;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.tags !== undefined) patch.tags = JSON.stringify(data.tags);
  if (data.status !== undefined) patch.status = data.status;

  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, id, patch);
  logActivity_(id, patch.name || c.name, 'update_customer', '更新客戶資料 · ' + (patch.name || c.name));
  bumpReport_('updates', 1);
  return getCustomer(id).customer;
}

/**
 * 更新某分類的資料夾狀態（保留給舊資料相容）
 */
function updateFolderMeta(customerId, category, patch) {
  // 輕量讀取，不要為了勾選完成度重掃 Drive
  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  var meta = c.folderMeta || defaultFolderMeta_(detail.categories);
  if (!meta[category]) meta[category] = { done: false, count: 0 };
  if (patch.done !== undefined) meta[category].done = !!patch.done;

  var completion = computeManualCompletion_(meta, detail.categories);
  var status = c.status === 'paused' && !patch.done
    ? 'paused'
    : deriveStatus_(completion.percent, c.status === 'paused' && patch.done ? '' : (c.status === 'paused' ? 'paused' : ''));

  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    folderMeta: JSON.stringify(meta),
    completion: completion.percent,
    status: status,
    updatedAt: nowIso_()
  });

  if (c.folderId) {
    try {
      writeMetadata_(DriveApp.getFolderById(c.folderId), {
        id: c.id,
        name: c.name,
        folderMeta: meta,
        updatedAt: nowIso_()
      });
    } catch (e) { /* ignore */ }
  }

  bumpReport_('updates', 1);
  if (patch.done) bumpReport_('organized', 1);
  c.folderMeta = meta;
  c.completion = completion.percent;
  c.status = status;
  return {
    customer: c,
    categories: detail.categories,
    folderMeta: meta,
    completion: completion,
    filesByCategory: detail.filesByCategory || {},
    filesLoaded: false
  };
}

function deleteCustomer(id) {
  var detail = getCustomer(id);
  if (detail.customer.folderId) trashCustomerFolder(detail.customer.folderId);
  deleteObjectById_(CONFIG.SHEETS.CUSTOMERS, id);
  logActivity_(id, detail.customer.name, 'delete_customer', '刪除客戶 · ' + detail.customer.name);
  return { ok: true };
}

function searchAll(query) {
  var q = String(query || '').trim().toLowerCase();
  if (!q) return { customers: [], files: [], query: query };

  try { ensureDriveIndexSynced_(false); } catch (e) { /* keep */ }
  var customers = filterRowsWithDriveFolder_(sheetToObjects_(CONFIG.SHEETS.CUSTOMERS)).map(customerFromRow_);
  var matchedCustomers = [];
  var matchedFiles = [];

  customers.forEach(function (c) {
    var hay = [
      c.name, c.phone, c.email, c.notes, c.zhuyin, c.birthday,
      c.address, c.idNumber, c.gender, (c.tags || []).join(' ')
    ].join(' ').toLowerCase();
    var customerHit = hay.indexOf(q) !== -1;
    var fileHits = [];
    if (c.folderId) {
      try {
        listAllCustomerFiles(c.folderId).forEach(function (f) {
          if (
            String(f.name).toLowerCase().indexOf(q) !== -1 ||
            String(f.category).toLowerCase().indexOf(q) !== -1
          ) {
            fileHits.push({ customerId: c.id, customerName: c.name, file: f });
          }
        });
      } catch (e) { /* skip */ }
    }
    if (customerHit || fileHits.length) matchedCustomers.push(c);
    matchedFiles = matchedFiles.concat(fileHits);
  });

  matchedCustomers.sort(function (a, b) { return compareByZhuyin(a.name, b.name); });
  return { customers: matchedCustomers, files: matchedFiles, query: query };
}

function logActivity_(customerId, customerName, action, detail) {
  appendObject_(CONFIG.SHEETS.ACTIVITY, {
    id: newId_(),
    customerId: customerId || '',
    customerName: customerName || '',
    action: action,
    detail: detail,
    createdAt: nowIso_()
  });
}

function bumpReport_(field, delta) {
  var date = todayStr_();
  var sh = getSheet_(CONFIG.SHEETS.REPORTS);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var dateCol = headers.indexOf('date');
  var fieldCol = headers.indexOf(field);
  if (fieldCol < 0) return;

  for (var i = 1; i < values.length; i++) {
    var cellDate = values[i][dateCol];
    var asStr = cellDate instanceof Date
      ? Utilities.formatDate(cellDate, 'Asia/Taipei', 'yyyy-MM-dd')
      : String(cellDate);
    if (asStr === date) {
      var cur = Number(values[i][fieldCol]) || 0;
      sh.getRange(i + 1, fieldCol + 1).setValue(cur + delta);
      invalidateSheetCache_(CONFIG.SHEETS.REPORTS);
      return;
    }
  }
  var row = { date: date, newCustomers: 0, organized: 0, missingDocs: 0, updates: 0 };
  row[field] = delta;
  appendObject_(CONFIG.SHEETS.REPORTS, row);
}

function splitImportCells_(line) {
  line = String(line == null ? '' : line).replace(/^\uFEFF/, '').replace(/\r$/, '');
  if (!String(line).trim()) return [];
  if (line.indexOf('\t') >= 0) {
    return line.split('\t').map(function (s) { return String(s || '').trim(); });
  }
  if (line.indexOf(',') >= 0 || line.indexOf('，') >= 0) {
    return line.split(/[,，]/).map(function (s) {
      return String(s || '').trim().replace(/^["']+|["']+$/g, '');
    });
  }
  return String(line).trim().split(/\s+/);
}

function importHeaderKey_(cell) {
  var s = String(cell || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  if (/姓名|名字|客戶名|^name$|fullname/.test(s)) return 'name';
  if (/生日|出生|birthday|^dob$/.test(s)) return 'birthday';
  if (/電話|手機|phone|tel|行動/.test(s)) return 'phone';
  if (/郵|email|e-mail|mail/.test(s)) return 'email';
  if (/性別|gender/.test(s)) return 'gender';
  if (/地址|address/.test(s)) return 'address';
  return '';
}

function looksLikePhoneImport_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10 && d.charAt(0) === '0') return true;
  if (d.length === 9 && d.charAt(0) === '9') return true;
  if (d.length >= 8 && d.length <= 11 && d.charAt(0) === '0') return true;
  return false;
}

function looksLikeBirthdayImport_(raw) {
  var s = String(raw || '').trim();
  if (!s || looksLikePhoneImport_(s)) return false;
  try {
    return !!parseBirthdayParts_(s);
  } catch (e) {
    return false;
  }
}

function assignImportFields_(cells) {
  var out = { name: '', phone: '', birthday: '', email: '', gender: '', address: '' };
  var leftover = [];
  for (var i = 0; i < cells.length; i++) {
    var cell = String(cells[i] || '').trim();
    if (!cell) continue;
    if (!out.phone && looksLikePhoneImport_(cell)) { out.phone = cell; continue; }
    if (!out.birthday && looksLikeBirthdayImport_(cell)) { out.birthday = cell; continue; }
    if (!out.email && /@/.test(cell)) { out.email = cell; continue; }
    leftover.push(cell);
  }
  out.name = leftover.join(' ').trim();
  return out;
}

/** 雷佳明05/09 電話:0972905295 */
function parseBirthdayRosterLine_(line) {
  line = String(line == null ? '' : line).replace(/^\uFEFF/, '').replace(/\r$/, '').trim();
  if (!line) return { skip: true };
  if (/^[—\-－_~～═\s]+$/.test(line)) return { skip: true };
  if (/名單/.test(line) && !/\d{1,2}\s*[\/月]\s*\d{1,2}/.test(line)) return { skip: true };
  var m = line.match(/^(.+?)(\d{1,2})\s*[\/月]\s*(\d{1,2})日?(?:\s*電話\s*[:：]?\s*([0-9\-]+))?\s*$/);
  if (!m) return null;
  var name = String(m[1] || '').trim();
  if (!name) return null;
  var mm = Number(m[2]);
  var dd = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  var pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return {
    skip: false,
    item: {
      name: name,
      birthday: pad(mm) + '-' + pad(dd),
      phone: String(m[4] || '').trim(),
      email: '',
      gender: '',
      address: ''
    }
  };
}

function parseCustomerImportText_(text) {
  var lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\n/);
  var items = [];
  var warnings = [];
  var keys = null;

  for (var i = 0; i < lines.length; i++) {
    var roster = parseBirthdayRosterLine_(lines[i]);
    if (roster && roster.skip) continue;
    if (roster && roster.item) {
      items.push(roster.item);
      continue;
    }

    var cells = splitImportCells_(lines[i]);
    if (!cells.length) continue;
    var nonempty = cells.filter(function (c) { return String(c || '').trim(); });
    if (!nonempty.length) continue;

    if (!keys && nonempty.length >= 2) {
      var mapped = nonempty.map(importHeaderKey_);
      var hit = mapped.filter(Boolean).length;
      if (hit >= 2 || mapped.indexOf('name') >= 0) {
        keys = cells.map(importHeaderKey_);
        continue;
      }
    }

    var row = { name: '', phone: '', birthday: '', email: '', gender: '', address: '' };
    if (keys) {
      for (var k = 0; k < cells.length; k++) {
        var key = keys[k];
        if (key) row[key] = String(cells[k] || '').trim();
      }
      if (!row.name) {
        var guessed = assignImportFields_(cells);
        row.name = guessed.name;
        if (!row.phone) row.phone = guessed.phone;
        if (!row.birthday) row.birthday = guessed.birthday;
        if (!row.email) row.email = guessed.email;
      }
    } else {
      row = assignImportFields_(cells);
    }

    row.name = String(row.name || '').trim();
    if (!row.name) {
      warnings.push('第 ' + (i + 1) + ' 行找不到姓名');
      continue;
    }
    items.push({
      name: row.name,
      phone: String(row.phone || '').trim(),
      birthday: String(row.birthday || '').trim(),
      email: String(row.email || '').trim(),
      gender: String(row.gender || '').trim(),
      address: String(row.address || '').trim()
    });
  }

  return { items: items, warnings: warnings, count: items.length };
}

function importCustomersBulk(payload) {
  payload = payload || {};
  var items = payload.items;
  if ((!items || !items.length) && payload.text) {
    items = parseCustomerImportText_(payload.text).items;
  }
  items = items || [];
  var max = 20;
  if (items.length > max) items = items.slice(0, max);

  var created = 0;
  var updated = 0;
  var skipped = 0;
  var errors = [];
  var byName = {};
  try {
    var allRows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
    for (var a = 0; a < allRows.length; a++) {
      var nm0 = String(allRows[a].name || '').trim();
      if (nm0) byName[nm0] = allRows[a];
    }
  } catch (eMap) { byName = {}; }

  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var name = pickCustomerName_(it);
    if (!name) {
      skipped += 1;
      continue;
    }
    try {
      var existing = byName[name] || null;
      if (existing) {
        var patch = { updatedAt: nowIso_() };
        if (it.phone) patch.phone = String(it.phone).trim();
        if (it.birthday) patch.birthday = normalizeBirthday_(it.birthday);
        if (it.email) patch.email = String(it.email).trim();
        if (it.gender) patch.gender = String(it.gender).trim();
        if (it.address) patch.address = String(it.address).trim();
        var fid = String(existing.folderId || '').trim();
        if (!fid || !folderExists_(fid)) {
          var rebuilt = requireLiveCustomerFolder_(
            createCustomerFolderTree(name, { id: String(existing.id), name: name }),
            name
          );
          patch.folderId = rebuilt.folderId;
          patch.zhuyin = rebuilt.zhuyin || getZhuyinInitial(name);
        } else {
          try { relocateIndexedCustomer_(customerFromRow_(existing)); } catch (eRel) { /* keep */ }
        }
        updateObjectById_(CONFIG.SHEETS.CUSTOMERS, existing.id, patch);
        byName[name] = existing;
        updated += 1;
      } else {
        var createdRow = createCustomer({
          name: name,
          phone: it.phone || '',
          birthday: it.birthday || '',
          email: it.email || '',
          gender: it.gender || '',
          address: it.address || ''
        });
        if (createdRow && createdRow.name) byName[createdRow.name] = createdRow;
        created += 1;
      }
    } catch (e) {
      errors.push({ name: name, error: String((e && e.message) || e) });
    }
  }

  try { invalidateSheetCache_(CONFIG.SHEETS.CUSTOMERS); } catch (eInv) { /* ignore */ }

  return {
    created: created,
    updated: updated,
    skipped: skipped,
    errors: errors,
    count: items.length
  };
}

// END DriveService.gs
