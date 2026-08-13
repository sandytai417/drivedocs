/**
 * DriveDocs — 客戶 CRUD（日期分夾 · Drive 刪除同步）
 */

/** 續保：檔案數 ≥ 2 */
function isRenewalFromCount_(fileCount) {
  return (Number(fileCount) || 0) >= 2;
}

/** 相容舊 folderMeta（分類鍵）與新（日期鍵） */
function isPolicyCategory_(name) {
  return String(name || '').indexOf('保單') >= 0;
}

function policyFileCountFromMeta_(folderMeta) {
  folderMeta = folderMeta || {};
  var n = 0;
  Object.keys(folderMeta).forEach(function (k) {
    if (isPolicyCategory_(k)) n += Number(folderMeta[k].count) || 0;
  });
  return n;
}

function isRenewalFromMeta_(folderMeta) {
  folderMeta = folderMeta || {};
  var total = 0;
  Object.keys(folderMeta).forEach(function (k) {
    total += Number(folderMeta[k].count) || 0;
  });
  if (total >= 2) return true;
  return policyFileCountFromMeta_(folderMeta) >= 2;
}

function bumpFolderMetaCount_(folderMeta, dateKey, delta) {
  folderMeta = folderMeta || {};
  dateKey = normalizeDocDate_(dateKey || todayStr_());
  if (!folderMeta[dateKey]) {
    folderMeta[dateKey] = { done: false, count: 0 };
  }
  folderMeta[dateKey].count = Math.max(0, (Number(folderMeta[dateKey].count) || 0) + Number(delta || 0));
  folderMeta[dateKey].done = folderMeta[dateKey].count > 0;
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

  var folderMeta = parseJsonSafe_(row.folderMeta, null) || {};
  if (!folderMeta || typeof folderMeta !== 'object') folderMeta = {};

  var completion = Number(row.completion);
  if (isNaN(completion)) {
    completion = computeManualCompletion_(folderMeta, []).percent;
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
    isRenewal: isRenewalFromMeta_(folderMeta) || isRenewalFromCount_(fileCount),
    zhuyin: String(row.zhuyin || getZhuyinInitial(name)),
    givenZhuyin: light ? '' : getGivenNameZhuyin(name)
  };
  if (opts.compact) {
    delete out.tags;
    delete out.notes;
    delete out.givenZhuyin;
  }
  return out;
}

function customerFromRowCompact_(row) {
  return customerFromRow_(row, { light: true, compact: true });
}

function listCustomers(sortBy) {
  // 列表前輕量同步（60 秒內有快取）
  try { syncCustomersWithDrive_({ force: false }); } catch (e) { /* ignore */ }

  sortBy = sortBy || 'zhuyin';
  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(function (r) {
    return customerFromRow_(r, { light: true, compact: true });
  });
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

  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) {
      var c = customerFromRow_(rows[i], { light: !!opts.light });
      if (opts.withNotes || opts.light) {
        c.notes = String(rows[i].notes || '');
        c.tags = parseJsonSafe_(rows[i].tags, []);
      }

      // Drive 資料夾已刪 → 同步移除並報錯
      if (c.folderId && !folderExists_(c.folderId)) {
        deleteObjectById_(CONFIG.SHEETS.CUSTOMERS, c.id);
        throw new Error('此客戶的 Drive 資料夾已刪除，已從網站同步移除');
      }

      c.policyFileCount = policyFileCountFromMeta_(c.folderMeta);
      c.isRenewal = isRenewalFromMeta_(c.folderMeta) || isRenewalFromCount_(c.fileCount);

      var dates = [];
      var filesByDate = {};

      if (!skipFiles && c.folderId) {
        filesByDate = listCustomerFilesGrouped_(c.folderId);
        dates = Object.keys(filesByDate).sort(function (a, b) {
          return String(b).localeCompare(String(a));
        });
        var fileCount = 0;
        var meta = {};
        dates.forEach(function (d) {
          var files = filesByDate[d] || [];
          fileCount += files.length;
          meta[d] = { done: files.length > 0, count: files.length };
        });
        c.fileCount = fileCount;
        c.folderMeta = meta;
        return {
          customer: c,
          dates: dates,
          categories: dates, // 舊前端相容：categories = 日期列表
          filesByDate: filesByDate,
          filesByCategory: filesByDate,
          folderMeta: meta,
          filesLoaded: true
        };
      }

      dates = Object.keys(c.folderMeta || {}).filter(isDateFolderName_).sort(function (a, b) {
        return String(b).localeCompare(String(a));
      });
      dates.forEach(function (d) { filesByDate[d] = []; });

      return {
        customer: c,
        dates: dates,
        categories: dates,
        filesByDate: filesByDate,
        filesByCategory: filesByDate,
        folderMeta: c.folderMeta,
        filesLoaded: false
      };
    }
  }
  throw new Error('找不到客戶：' + id);
}

/** 點開某一日期才載檔 */
function listCustomerCategoryFiles(customerId, dateName) {
  return listCustomerDateFiles(customerId, dateName);
}

function listCustomerDateFiles(customerId, dateName) {
  var detail = getCustomer(customerId, { skipFiles: true, light: true });
  var c = detail.customer;
  if (!c.folderId) {
    return { customerId: customerId, date: dateName, category: dateName, files: [] };
  }
  var files = listDateFiles(c.folderId, dateName);
  return {
    customerId: customerId,
    date: dateName,
    category: dateName,
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
    data.customerName, data.name, data.fullName, data['姓名'], data.Name, data.customer_name
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] == null) continue;
    if (typeof candidates[i] === 'object') continue;
    var n = String(candidates[i]).trim();
    if (n && n !== 'null' && n !== 'undefined' && n !== '[object Object]') return n;
  }
  return '';
}

function ensureCustomer(data) {
  if (typeof data === 'string') data = { name: data, customerName: data };
  data = data || {};

  var id = data.id || data.customerId || '';
  if (id) {
    try {
      return getCustomer(String(id)).customer;
    } catch (e) { /* fall through */ }
  }

  var name = pickCustomerName_(data);
  if (!name) throw new Error('請填寫客戶姓名');

  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].name) === name) {
      var existing = customerFromRow_(rows[i]);
      if (existing.folderId && !folderExists_(existing.folderId)) {
        deleteObjectById_(CONFIG.SHEETS.CUSTOMERS, existing.id);
        break;
      }
      return existing;
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
      var hit = customerFromRow_(existing[i]);
      if (hit.folderId && !folderExists_(hit.folderId)) {
        deleteObjectById_(CONFIG.SHEETS.CUSTOMERS, hit.id);
      } else {
        return hit;
      }
    }
  }

  var id = newId_();
  var now = nowIso_();
  var folderMeta = {};
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

  var tree = createCustomerFolderTree(name, meta);
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
    zhuyin: getZhuyinInitial(name)
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
    if (newName !== c.name && c.folderId) renameCustomerFolder(c.folderId, newName);
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

/** 更新某日期資料夾狀態（舊名 updateFolderMeta 仍可用） */
function updateFolderMeta(customerId, dateKey, patch) {
  var detail = getCustomer(customerId, { skipFiles: true });
  var c = detail.customer;
  var meta = c.folderMeta || {};
  dateKey = isDateFolderName_(dateKey) ? dateKey : normalizeDocDate_(dateKey);
  if (!meta[dateKey]) meta[dateKey] = { done: false, count: 0 };
  if (patch.done !== undefined) meta[dateKey].done = !!patch.done;
  if (patch.count !== undefined) meta[dateKey].count = Number(patch.count) || 0;

  var completion = computeManualCompletion_(meta, []);
  var status = deriveStatus_(completion.percent, c.status === 'paused' ? 'paused' : '');

  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, customerId, {
    folderMeta: JSON.stringify(meta),
    completion: completion.percent,
    status: status,
    updatedAt: nowIso_()
  });

  bumpReport_('updates', 1);
  if (patch.done) bumpReport_('organized', 1);
  c.folderMeta = meta;
  c.completion = completion.percent;
  c.status = status;
  return {
    customer: c,
    dates: Object.keys(meta),
    categories: Object.keys(meta),
    folderMeta: meta,
    completion: completion,
    filesByCategory: {},
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
  try { syncCustomersWithDrive_({ force: false }); } catch (e) { /* ignore */ }
  var q = String(query || '').trim().toLowerCase();
  if (!q) return { customers: [], files: [], query: query };

  var customers = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(customerFromRow_);
  var matchedCustomers = [];
  var matchedFiles = [];

  customers.forEach(function (c) {
    var hay = [
      c.name, c.phone, c.email, c.notes, c.zhuyin, c.birthday,
      c.address, c.idNumber, c.gender, (c.tags || []).join(' ')
    ].join(' ').toLowerCase();
    var customerHit = hay.indexOf(q) !== -1;
    var fileHits = [];
    if (c.folderId && folderExists_(c.folderId)) {
      try {
        listAllCustomerFiles(c.folderId).forEach(function (f) {
          if (
            String(f.name).toLowerCase().indexOf(q) !== -1 ||
            String(f.docDate || f.category).toLowerCase().indexOf(q) !== -1
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
