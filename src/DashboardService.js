/**
 * DriveDocs — Dashboard & Reports
 */

/**
 * Dashboard summary for home page.
 * @return {Object}
 */
function getDashboard() {
  var customers = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(customerFromRow_);
  var today = todayStr_();
  var todayNew = 0;
  var pending = 0;
  var sumCompletion = 0;

  customers.forEach(function (c) {
    if (String(c.createdAt).indexOf(today) === 0) todayNew++;
    if (c.completion < 100) pending++;
    sumCompletion += c.completion;
  });

  var avgCompletion = customers.length
    ? Math.round(sumCompletion / customers.length)
    : 0;

  var report = getTodayReport_();
  var activity = getRecentActivity(12);

  return {
    totalCustomers: customers.length,
    todayNew: todayNew,
    todayOrganized: report.organized || 0,
    pending: pending,
    completionRate: avgCompletion,
    recentUpdates: report.updates || 0,
    activity: activity,
    missingDocs: countMissingDocs_(customers)
  };
}

/**
 * Daily report view.
 * @return {Object}
 */
function getReports() {
  var today = getTodayReport_();
  var customers = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(customerFromRow_);
  var missing = [];
  customers.forEach(function (c) {
    if (!c.folderId) return;
    try {
      var comp = computeCompletion(c.folderId);
      if (comp.percent < 100) {
        var gaps = comp.checklist.filter(function (x) { return !x.done; }).map(function (x) {
          return x.category;
        });
        missing.push({
          customerId: c.id,
          customerName: c.name,
          completion: comp.percent,
          missingCategories: gaps
        });
      }
    } catch (e) { /* skip */ }
  });
  missing.sort(function (a, b) { return a.completion - b.completion; });

  var sum = 0;
  customers.forEach(function (c) { sum += c.completion; });
  var avg = customers.length ? Math.round(sum / customers.length) : 0;

  var history = sheetToObjects_(CONFIG.SHEETS.REPORTS)
    .map(function (r) {
      var d = r.date;
      if (d instanceof Date) {
        d = Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
      }
      return {
        date: String(d),
        newCustomers: Number(r.newCustomers) || 0,
        organized: Number(r.organized) || 0,
        missingDocs: Number(r.missingDocs) || 0,
        updates: Number(r.updates) || 0
      };
    })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
    .slice(0, 14);

  return {
    today: {
      newCustomers: today.newCustomers || 0,
      organized: today.organized || 0,
      missingDocs: missing.length,
      updates: today.updates || 0
    },
    completionRate: avg,
    missing: missing,
    history: history
  };
}

/**
 * @return {Object}
 */
function getTodayReport_() {
  var date = todayStr_();
  var rows = sheetToObjects_(CONFIG.SHEETS.REPORTS);
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i].date;
    if (d instanceof Date) {
      d = Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    }
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

/**
 * @param {number} limit
 * @return {Object[]}
 */
function getRecentActivity(limit) {
  limit = limit || 10;
  var rows = sheetToObjects_(CONFIG.SHEETS.ACTIVITY);
  rows.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return rows.slice(0, limit).map(function (r) {
    var t = String(r.createdAt || '');
    var time = t.length >= 16 ? t.slice(11, 16) : '';
    return {
      id: String(r.id),
      customerId: String(r.customerId || ''),
      customerName: String(r.customerName || ''),
      action: String(r.action || ''),
      detail: String(r.detail || ''),
      createdAt: t,
      time: time
    };
  });
}

/**
 * @param {Object[]} customers
 * @return {number}
 */
function countMissingDocs_(customers) {
  var n = 0;
  customers.forEach(function (c) {
    if (c.completion < 100) n++;
  });
  return n;
}
