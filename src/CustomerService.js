/**
 * DriveDocs — Customer CRUD
 */

/**
 * Normalize customer row from sheet.
 * @param {Object} row
 * @return {Object}
 */
function customerFromRow_(row) {
  var tags = row.tags;
  if (typeof tags === 'string' && tags) {
    try {
      tags = JSON.parse(tags);
    } catch (e) {
      tags = tags.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
    }
  }
  if (!Array.isArray(tags)) tags = [];
  return {
    id: String(row.id),
    name: String(row.name || ''),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    tags: tags,
    notes: String(row.notes || ''),
    folderId: String(row.folderId || ''),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || ''),
    completion: Number(row.completion) || 0,
    zhuyin: String(row.zhuyin || getZhuyinInitial(row.name))
  };
}

/**
 * List all customers with optional sort.
 * @param {string=} sortBy zhuyin|updated|created|completion
 * @return {Object}
 */
function listCustomers(sortBy) {
  sortBy = sortBy || 'zhuyin';
  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(customerFromRow_);
  if (sortBy === 'updated') {
    rows.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  } else if (sortBy === 'created') {
    rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  } else if (sortBy === 'completion') {
    rows.sort(function (a, b) { return b.completion - a.completion; });
  } else {
    rows.sort(function (a, b) { return compareByZhuyin(a.name, b.name); });
  }
  return {
    customers: rows,
    groups: sortBy === 'zhuyin' ? groupByZhuyin(rows) : null,
    sortBy: sortBy
  };
}

/**
 * Get one customer + files + completion checklist.
 * @param {string} id
 * @return {Object}
 */
function getCustomer(id) {
  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) {
      var c = customerFromRow_(rows[i]);
      var categories = getCategoryTemplate_();
      var filesByCategory = {};
      categories.forEach(function (cat) {
        filesByCategory[cat] = c.folderId ? listCategoryFiles(c.folderId, cat) : [];
      });
      var completion = c.folderId
        ? computeCompletion(c.folderId)
        : { percent: 0, filled: 0, total: categories.length, checklist: [] };
      if (completion.percent !== c.completion) {
        updateObjectById_(CONFIG.SHEETS.CUSTOMERS, c.id, { completion: completion.percent });
        c.completion = completion.percent;
      }
      return {
        customer: c,
        categories: categories,
        filesByCategory: filesByCategory,
        completion: completion
      };
    }
  }
  throw new Error('找不到客戶：' + id);
}

/**
 * Create customer + Drive folder tree.
 * @param {Object} data
 * @return {Object}
 */
function createCustomer(data) {
  var name = String(data.name || '').trim();
  if (!name) throw new Error('請輸入客戶姓名');

  var existing = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].name) === name) {
      throw new Error('客戶「' + name + '」已存在');
    }
  }

  var id = newId_();
  var now = nowIso_();
  var meta = {
    id: id,
    name: name,
    phone: data.phone || '',
    email: data.email || '',
    tags: data.tags || [],
    notes: data.notes || '',
    createdAt: now
  };

  var tree = createCustomerFolderTree(name, meta);
  var zhuyin = getZhuyinInitial(name);
  var row = {
    id: id,
    name: name,
    phone: data.phone || '',
    email: data.email || '',
    tags: JSON.stringify(data.tags || []),
    notes: data.notes || '',
    folderId: tree.folderId,
    createdAt: now,
    updatedAt: now,
    completion: 0,
    zhuyin: zhuyin
  };
  appendObject_(CONFIG.SHEETS.CUSTOMERS, row);
  logActivity_(id, name, 'create_customer', '新增客戶');
  bumpReport_('newCustomers', 1);
  bumpReport_('updates', 1);

  return customerFromRow_(row);
}

/**
 * Update customer fields; rename Drive folder if name changes.
 * @param {string} id
 * @param {Object} data
 * @return {Object}
 */
function updateCustomer(id, data) {
  var detail = getCustomer(id);
  var c = detail.customer;
  var patch = { updatedAt: nowIso_() };

  if (data.name !== undefined) {
    var newName = String(data.name).trim();
    if (!newName) throw new Error('請輸入客戶姓名');
    if (newName !== c.name && c.folderId) {
      renameCustomerFolder(c.folderId, newName);
    }
    patch.name = newName;
    patch.zhuyin = getZhuyinInitial(newName);
  }
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.email !== undefined) patch.email = data.email;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.tags !== undefined) patch.tags = JSON.stringify(data.tags);

  updateObjectById_(CONFIG.SHEETS.CUSTOMERS, id, patch);
  logActivity_(id, patch.name || c.name, 'update_customer', '更新客戶資料');
  bumpReport_('updates', 1);

  return getCustomer(id).customer;
}

/**
 * Delete customer index row + trash Drive folder.
 * @param {string} id
 * @return {{ok: boolean}}
 */
function deleteCustomer(id) {
  var detail = getCustomer(id);
  if (detail.customer.folderId) {
    trashCustomerFolder(detail.customer.folderId);
  }
  deleteObjectById_(CONFIG.SHEETS.CUSTOMERS, id);
  logActivity_(id, detail.customer.name, 'delete_customer', '刪除客戶');
  return { ok: true };
}

/**
 * Instant search across name, phone, email, tags, folder, file names.
 * @param {string} query
 * @return {Object}
 */
function searchAll(query) {
  var q = String(query || '').trim().toLowerCase();
  if (!q) return { customers: [], files: [] };

  var customers = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(customerFromRow_);
  var matchedCustomers = [];
  var matchedFiles = [];

  customers.forEach(function (c) {
    var hay = [
      c.name, c.phone, c.email, c.notes, c.zhuyin,
      (c.tags || []).join(' ')
    ].join(' ').toLowerCase();
    var customerHit = hay.indexOf(q) !== -1;

    var fileHits = [];
    if (c.folderId) {
      try {
        var files = listAllCustomerFiles(c.folderId);
        files.forEach(function (f) {
          if (
            String(f.name).toLowerCase().indexOf(q) !== -1 ||
            String(f.category).toLowerCase().indexOf(q) !== -1
          ) {
            fileHits.push({
              customerId: c.id,
              customerName: c.name,
              file: f
            });
          }
        });
      } catch (e) { /* skip broken folders */ }
    }

    if (customerHit || fileHits.length) {
      matchedCustomers.push(c);
    }
    matchedFiles = matchedFiles.concat(fileHits);
  });

  matchedCustomers.sort(function (a, b) {
    return compareByZhuyin(a.name, b.name);
  });

  return { customers: matchedCustomers, files: matchedFiles, query: query };
}

/**
 * Log activity feed item.
 */
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

/**
 * Increment today's report counter.
 * @param {string} field newCustomers|organized|missingDocs|updates
 * @param {number} delta
 */
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
      return;
    }
  }
  var row = { date: date, newCustomers: 0, organized: 0, missingDocs: 0, updates: 0 };
  row[field] = delta;
  appendObject_(CONFIG.SHEETS.REPORTS, row);
}
