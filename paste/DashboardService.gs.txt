/**
 * DriveDocs — 儀表板與每月回報（含首頁一次載入）
 */

function getDashboard() {
  return getHomePayload_().dashboard;
}

/**
 * 首頁一次回傳：儀表板 + 客戶列表（避免雙重讀表／雙重 round-trip）
 */
function getHomePayload() {
  return getHomePayload_();
}

/** 首頁專用極速列轉換（少算、少字串、小 JSON） */
function customerFromRowHomeFast_(row) {
  var name = String(row.name || '');
  var completion = Number(row.completion);
  if (isNaN(completion)) completion = 0;
  var fileCount = Number(row.fileCount) || 0;
  var folderMeta = null;
  if (row.folderMeta) {
    try {
      folderMeta = typeof row.folderMeta === 'string'
        ? JSON.parse(row.folderMeta)
        : row.folderMeta;
    } catch (e) { folderMeta = null; }
  }
  if (!folderMeta || typeof folderMeta !== 'object') folderMeta = {};

  var birthday = '';
  if (row.birthday != null && row.birthday !== '') {
    if (typeof coerceDateLikeToYmd_ === 'function') {
      birthday = coerceDateLikeToYmd_(row.birthday);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthday))) {
      birthday = typeof normalizeBirthday_ === 'function'
        ? normalizeBirthday_(row.birthday)
        : String(row.birthday || '');
    }
  }

  var zhuyin = String(row.zhuyin || '').trim();
  if (!zhuyin && name && typeof getZhuyinInitial === 'function') {
    try { zhuyin = String(getZhuyinInitial(name) || ''); } catch (e2) { zhuyin = ''; }
  }

  return {
    id: String(row.id || ''),
    name: name,
    phone: String(row.phone || ''),
    birthday: birthday,
    gender: String(row.gender || ''),
    idNumber: String(row.idNumber || ''),
    address: String(row.address || ''),
    updatedAt: String(row.updatedAt || ''),
    completion: completion,
    status: String(row.status || deriveStatus_(completion)),
    fileCount: fileCount,
    isRenewal: typeof isRenewalFromMeta_ === 'function' ? isRenewalFromMeta_(folderMeta) : fileCount > 1,
    zhuyin: zhuyin,
    folderId: String(row.folderId || ''),
    folderMeta: folderMeta,
    _meta: folderMeta
  };
}

function getHomePayload_() {
  var cached = sharedGetJson_('homePayload_v6');
  if (cached && cached.dashboard && cached.customers) {
    return cached;
  }
  var mem = cacheGet_('homePayload_v6');
  if (mem && mem.dashboard && mem.customers) return mem;

  var categories = getCategoryTemplate_();

  var rows = filterRowsWithDriveFolder_(sheetToObjects_(CONFIG.SHEETS.CUSTOMERS));
  var full = [];
  for (var i = 0; i < rows.length; i++) {
    full.push(customerFromRowHomeFast_(rows[i]));
  }
  full.sort(function (a, b) {
    return typeof compareByZhuyin === 'function'
      ? compareByZhuyin(a.name, b.name)
      : String(a.name).localeCompare(String(b.name), 'zh-Hant');
  });

  for (i = 0; i < full.length; i++) {
    delete full[i]._meta;
  }

  var birthdays = listBirthdaysFromCustomers_(full);
  var bdayCustomers = (birthdays.customers || []).map(function (b) {
    return {
      id: b.id,
      name: b.name,
      phone: b.phone || '',
      birthdayDisplay: b.birthdayDisplay || '',
      weekdayLabel: b.weekdayLabel || '',
      age: b.age
    };
  });

  var customers = full.map(function (c) {
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      birthday: c.birthday,
      gender: c.gender,
      idNumber: c.idNumber,
      address: c.address,
      updatedAt: c.updatedAt,
      completion: c.completion,
      status: c.status,
      fileCount: c.fileCount,
      isRenewal: c.isRenewal,
      zhuyin: c.zhuyin,
      folderId: c.folderId || '',
      folderMeta: c.folderMeta || {}
    };
  });

  var report = getTodayReport_();

  var dashboard = {
    totalCustomers: customers.length,
    todayOrganized: report.organized || 0,
    categories: categories,
    birthdaysThisWeek: {
      weekLabel: birthdays.weekLabel || '',
      count: bdayCustomers.length,
      customers: bdayCustomers
    }
  };

  var payload = {
    dashboard: dashboard,
    customers: {
      customers: customers,
      groups: null,
      sortBy: 'zhuyin',
      initials: ZHUYIN_ORDER.filter(function (z) { return z !== '#'; })
    }
  };
  cacheSet_('homePayload_v6', payload);
  sharedPutJson_('homePayload_v6', payload, 300);
  return payload;
}

function getReports() {
  var month = monthStr_();
  var monthStats = aggregateMonth_(month);
  var lectures = listLectures();
  var activities = listActivities();
  var week = currentWeekLabel_();
  var lecturesThisWeek = lectures.filter(function (x) { return x.period === week; }).length;
  var activitiesThisWeek = activities.filter(function (x) { return x.period === week; }).length;
  var activitiesThisMonth = activities.filter(function (x) {
    return String(x.period || '').indexOf(month.replace('-', '/').slice(0, 7)) === 0 ||
      String(x.period || '').indexOf(month) === 0 ||
      x.period === week;
  }).length;

  return {
    month: month,
    monthStats: monthStats,
    lecturesThisWeek: lecturesThisWeek,
    activitiesThisWeek: activitiesThisWeek,
    activitiesThisMonth: activitiesThisMonth,
    weekLabel: week,
    history: buildMonthHistory_(),
    activity: getRecentActivity(12)
  };
}

function aggregateMonth_(month) {
  var rows = sheetToObjects_(CONFIG.SHEETS.REPORTS);
  var out = { newCustomers: 0, organized: 0, updates: 0, missingDocs: 0 };
  rows.forEach(function (r) {
    var d = r.date;
    if (d instanceof Date) d = Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    d = String(d);
    if (d.indexOf(month) === 0) {
      out.newCustomers += Number(r.newCustomers) || 0;
      out.organized += Number(r.organized) || 0;
      out.updates += Number(r.updates) || 0;
      out.missingDocs += Number(r.missingDocs) || 0;
    }
  });
  return out;
}

function buildMonthHistory_() {
  var rows = sheetToObjects_(CONFIG.SHEETS.REPORTS);
  var map = {};
  rows.forEach(function (r) {
    var d = r.date;
    if (d instanceof Date) d = Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    var m = String(d).slice(0, 7);
    if (!map[m]) map[m] = { month: m, newCustomers: 0, organized: 0 };
    map[m].newCustomers += Number(r.newCustomers) || 0;
    map[m].organized += Number(r.organized) || 0;
  });
  return Object.keys(map)
    .sort(function (a, b) { return b.localeCompare(a); })
    .slice(0, 12)
    .map(function (k) { return map[k]; });
}

function getTodayReport_() {
  var date = todayStr_();
  var rows = sheetToObjects_(CONFIG.SHEETS.REPORTS);
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i].date;
    if (d instanceof Date) d = Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    if (String(d) === date) {
      return {
        date: date,
        newCustomers: Number(rows[i].newCustomers) || 0,
        organized: Number(rows[i].organized) || 0,
        missingDocs: Number(rows[i].missingDocs) || 0,
        updates: Number(rows[i].updates) || 0
      };
    }
  }
  return { date: date, newCustomers: 0, organized: 0, missingDocs: 0, updates: 0 };
}

function getRecentActivity(limit) {
  limit = limit || 10;
  var rows = sheetToObjects_(CONFIG.SHEETS.ACTIVITY);
  rows.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return rows.slice(0, limit).map(function (r) {
    var t = String(r.createdAt || '');
    return {
      id: String(r.id),
      customerId: String(r.customerId || ''),
      customerName: String(r.customerName || ''),
      action: String(r.action || ''),
      detail: String(r.detail || ''),
      createdAt: t,
      time: t.length >= 16 ? t.slice(11, 16) : ''
    };
  });
}
