/**
 * DriveDocs — Utils.gs（Sheets 索引＋共用工具）
 * 請用此檔「整份覆蓋」Apps Script 裡的 Utils
 * （若你沒有 Utils、只有 SheetService，也可改貼到 SheetService）
 */

/** 單次執行期快取：減少重複讀 Sheets／設定 */
var __RUNTIME_CACHE__ = {};

function cacheGet_(key) {
  return Object.prototype.hasOwnProperty.call(__RUNTIME_CACHE__, key)
    ? __RUNTIME_CACHE__[key]
    : undefined;
}

function cacheSet_(key, value) {
  __RUNTIME_CACHE__[key] = value;
  return value;
}

function cacheDel_(key) {
  try { delete __RUNTIME_CACHE__[key]; } catch (e) { /* ignore */ }
}

/** 跨請求快取（真正加速多次開啟） */
function sharedCache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

function sharedGetJson_(key) {
  var c = sharedCache_();
  if (!c) return null;
  try {
    var raw = c.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function sharedPutJson_(key, value, seconds) {
  var c = sharedCache_();
  if (!c) return;
  try {
    var s = JSON.stringify(value);
    // CacheService 上限約 100KB；太大就略過
    if (s.length > 90000) return;
    c.put(key, s, seconds || 60);
  } catch (e) { /* ignore */ }
}

function sharedRemove_(key) {
  var c = sharedCache_();
  if (!c) return;
  try { c.remove(key); } catch (e) { /* ignore */ }
}

function invalidateSheetCache_(sheetName) {
  if (sheetName) cacheDel_('sheet:' + sheetName);
  else {
    Object.keys(__RUNTIME_CACHE__).forEach(function (k) {
      if (k.indexOf('sheet:') === 0) cacheDel_(k);
    });
  }
  if (!sheetName || sheetName === CONFIG.SHEETS.SETTINGS) {
    cacheDel_('categories');
    cacheDel_('settingsMap');
    sharedRemove_('categories');
    sharedRemove_('settingsMap');
  }
  if (!sheetName || sheetName === CONFIG.SHEETS.CUSTOMERS) {
    cacheDel_('customerIndex');
  }
  cacheDel_('homePayload');
  cacheDel_('homePayload_v2');
  cacheDel_('homePayload_v3');
  cacheDel_('homePayload_v4');
  cacheDel_('homePayload_v5');
  cacheDel_('homePayload_v6');
  sharedRemove_('homePayload');
  sharedRemove_('homePayload_v2');
  sharedRemove_('homePayload_v3');
  sharedRemove_('homePayload_v4');
  sharedRemove_('homePayload_v5');
  sharedRemove_('homePayload_v6');
  sharedRemove_('bootPayload');
  sharedRemove_('bootPayload_v2');
  sharedRemove_('bootPayload_v3');
  sharedRemove_('bootPayload_v4');
  sharedRemove_('bootPayload_v5');
  sharedRemove_('bootPayload_v6');
  sharedRemove_('driveSyncResult_v1');
  sharedRemove_('liveFolderIds_v1');
}

function getSpreadsheet_() {
  var hit = cacheGet_('ss');
  if (hit) return hit;

  var id = '';
  try {
    id = getProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID) || '';
  } catch (e) {
    id = '';
  }

  if (id) {
    try {
      var opened = SpreadsheetApp.openById(id);
      if (opened) {
        maybeEnsureSheets_(opened);
        return cacheSet_('ss', opened);
      }
    } catch (e) {
      try { setProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID, ''); } catch (ignore) {}
    }
  }

  var title = (CONFIG && CONFIG.APP_NAME ? CONFIG.APP_NAME : 'DriveDocs') + ' Index';
  var ss = SpreadsheetApp.create(title);
  if (!ss) {
    throw new Error('無法建立 Google 試算表，請確認已授權 Spreadsheets 權限後再初始化。');
  }
  setProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID, ss.getId());
  ensureSheets_(ss);
  markSheetsOk_();
  return cacheSet_('ss', ss);
}

function sheetsOk_() {
  try {
    if (getProp_(CONFIG.PROP_KEYS.SHEETS_OK) === '1') return true;
  } catch (e) { /* ignore */ }
  var c = sharedCache_();
  try {
    if (c && c.get('sheetsOk') === '1') return true;
  } catch (e2) { /* ignore */ }
  return false;
}

function markSheetsOk_() {
  try { setProp_(CONFIG.PROP_KEYS.SHEETS_OK, '1'); } catch (e) { /* ignore */ }
  var c = sharedCache_();
  try { if (c) c.put('sheetsOk', '1', 21600); } catch (e2) { /* ignore */ }
  cacheSet_('sheetsEnsured', true);
}

function maybeEnsureSheets_(ss) {
  if (cacheGet_('sheetsEnsured') || sheetsOk_()) {
    cacheSet_('sheetsEnsured', true);
    return;
  }
  ensureSheets_(ss);
  markSheetsOk_();
}

function ensureSheets_(ss) {
  if (!ss) throw new Error('試算表物件無效');
  ensureSheet_(ss, CONFIG.SHEETS.CUSTOMERS, CONFIG.CUSTOMER_HEADERS);
  ensureSheet_(ss, CONFIG.SHEETS.SETTINGS, ['key', 'value']);
  ensureSheet_(ss, CONFIG.SHEETS.ACTIVITY, [
    'id', 'customerId', 'customerName', 'action', 'detail', 'createdAt'
  ]);
  ensureSheet_(ss, CONFIG.SHEETS.REPORTS, [
    'date', 'newCustomers', 'organized', 'missingDocs', 'updates'
  ]);
  ensureSheet_(ss, CONFIG.SHEETS.LECTURES, [
    'id', 'title', 'period', 'notes', 'docDate', 'files', 'createdAt'
  ]);
  ensureSheet_(ss, CONFIG.SHEETS.ACTIVITIES, [
    'id', 'title', 'period', 'notes', 'files', 'createdAt'
  ]);
  migrateCustomersHeaders_(ss);
  migrateSheetHeaders_(ss, CONFIG.SHEETS.LECTURES, [
    'id', 'title', 'period', 'notes', 'docDate', 'files', 'createdAt'
  ]);
}

function migrateSheetHeaders_(ss, sheetName, needed) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() === 0) return;
  var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var missing = [];
  needed.forEach(function (h) {
    if (headers.indexOf(h) === -1) missing.push(h);
  });
  if (!missing.length) return;
  while (headers.length && headers[headers.length - 1] === '') headers.pop();
  var startCol = headers.length + 1;
  sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
}

function migrateCustomersHeaders_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.CUSTOMERS);
  if (!sh || sh.getLastRow() === 0) return;
  var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var needed = CONFIG.CUSTOMER_HEADERS;
  var missing = [];
  needed.forEach(function (h) {
    if (headers.indexOf(h) === -1) missing.push(h);
  });
  if (!missing.length) return;
  while (headers.length && headers[headers.length - 1] === '') headers.pop();
  var startCol = headers.length + 1;
  sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  if (!cacheGet_('sheetsEnsured')) {
    ensureSheets_(ss);
    cacheSet_('sheetsEnsured', true);
  }
  var sh = ss.getSheetByName(name);
  if (!sh) {
    if (name === CONFIG.SHEETS.CUSTOMERS) sh = ensureSheet_(ss, name, CONFIG.CUSTOMER_HEADERS);
    else if (name === CONFIG.SHEETS.SETTINGS) sh = ensureSheet_(ss, name, ['key', 'value']);
    else if (name === CONFIG.SHEETS.ACTIVITY) {
      sh = ensureSheet_(ss, name, ['id', 'customerId', 'customerName', 'action', 'detail', 'createdAt']);
    } else if (name === CONFIG.SHEETS.REPORTS) {
      sh = ensureSheet_(ss, name, ['date', 'newCustomers', 'organized', 'missingDocs', 'updates']);
    } else if (name === CONFIG.SHEETS.LECTURES) {
      sh = ensureSheet_(ss, name, ['id', 'title', 'period', 'notes', 'docDate', 'files', 'createdAt']);
    } else if (name === CONFIG.SHEETS.ACTIVITIES) {
      sh = ensureSheet_(ss, name, ['id', 'title', 'period', 'notes', 'files', 'createdAt']);
    } else {
      throw new Error('找不到工作表：' + name);
    }
  }
  return sh;
}

function sheetToObjects_(sheetName) {
  var key = 'sheet:' + sheetName;
  var hit = cacheGet_(key);
  if (hit) return hit;

  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return cacheSet_(key, []);
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    var empty = true;
    for (var j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;
      var v = values[i][j];
      obj[headers[j]] = v;
      if (v !== '' && v !== null && v !== undefined) empty = false;
    }
    if (!empty) {
      obj._row = i + 1;
      rows.push(obj);
    }
  }
  return cacheSet_(key, rows);
}

function appendObject_(sheetName, obj) {
  var sh = getSheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    if (!h) return '';
    return obj[h] !== undefined && obj[h] !== null ? obj[h] : '';
  });
  sh.appendRow(row);
  invalidateSheetCache_(sheetName);
}

function updateObjectById_(sheetName, id, patch) {
  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  var headers = values[0];
  var idCol = headers.indexOf('id');
  if (idCol < 0) return false;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) {
      headers.forEach(function (h, j) {
        if (h && patch[h] !== undefined) {
          sh.getRange(i + 1, j + 1).setValue(patch[h]);
        }
      });
      invalidateSheetCache_(sheetName);
      return true;
    }
  }
  return false;
}

function deleteObjectById_(sheetName, id) {
  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  var headers = values[0];
  var idCol = headers.indexOf('id');
  if (idCol < 0) return false;
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idCol]) === String(id)) {
      sh.deleteRow(i + 1);
      invalidateSheetCache_(sheetName);
      return true;
    }
  }
  return false;
}

function getSettingsMap_() {
  var hit = cacheGet_('settingsMap');
  if (hit) return hit;
  var map = {};
  var rows = sheetToObjects_(CONFIG.SHEETS.SETTINGS);
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i].key;
    if (!k) continue;
    try {
      map[k] = JSON.parse(rows[i].value);
    } catch (e) {
      map[k] = rows[i].value;
    }
  }
  return cacheSet_('settingsMap', map);
}

function getSetting(key, defaultValue) {
  var map = getSettingsMap_();
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return defaultValue;
}

function setSetting(key, value) {
  var sh = getSheet_(CONFIG.SHEETS.SETTINGS);
  var values = sh.getDataRange().getValues();
  var serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(serialized);
      invalidateSheetCache_(CONFIG.SHEETS.SETTINGS);
      return;
    }
  }
  sh.appendRow([key, serialized]);
  invalidateSheetCache_(CONFIG.SHEETS.SETTINGS);
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss");
}

function todayStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function pad2Date_(n) {
  n = Number(n) || 0;
  return n < 10 ? '0' + n : String(n);
}

/**
 * 試算表 Date／英文 Date 字串 → yyyy-MM-dd
 * 避免變成 Sat Apr 24 1982 00:00:00 GMT+0800 …
 */
function coerceDateLikeToYmd_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    try {
      return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
    } catch (e0) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
  }
  var s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) {
    var p = s.split(/[\/\s]/);
    return p[0] + '-' + pad2Date_(p[1]) + '-' + pad2Date_(p[2]);
  }
  // Sat Apr 24 1982 00:00:00 GMT+0800 (台北標準時間) — 直接抓月日，避免時區差一天
  var eng = s.match(/\b([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\b/);
  if (eng) {
    var months = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
    };
    var mm = months[eng[1]];
    if (mm) return eng[3] + '-' + pad2Date_(mm) + '-' + pad2Date_(eng[2]);
  }
  if (/GMT|UTC|標準時間/i.test(s)) {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      try {
        return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
      } catch (e1) {
        return d.getFullYear() + '-' + pad2Date_(d.getMonth() + 1) + '-' + pad2Date_(d.getDate());
      }
    }
  }
  return s;
}

function gregorianYearFromRoc_(rocYear) {
  return Number(rocYear) + 1911;
}

function rocYearFromGregorian_(gy) {
  return Number(gy) - 1911;
}

/** 西元 yyyy-MM-dd → Drive 資料夾名 1150813 */
function rocFolderNameFromYmd_(ymd) {
  var s = String(ymd == null ? '' : ymd).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    s = typeof normalizeDocDate_ === 'function' ? normalizeDocDate_(s) : s;
    m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  }
  if (!m) {
    var today = todayStr_().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!today) return s.replace(/\D/g, '') || s;
    m = today;
  }
  var ry = rocYearFromGregorian_(m[1]);
  if (!(ry >= 1 && ry <= 999)) return m[1] + m[2] + m[3];
  if (ry >= 100) return String(ry) + m[2] + m[3];
  return (ry < 10 ? '0' : '') + String(ry) + m[2] + m[3];
}

/**
 * 西元 yyyy-MM-dd → 民國顯示 069/08/08；僅月日 MM-dd → 08/08
 */
function formatRocDateDisplay_(ymd) {
  var s = String(ymd == null ? '' : ymd).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    var ry = rocYearFromGregorian_(m[1]);
    if (!(ry >= 1 && ry <= 999)) return s;
    var ryStr = ry >= 100 ? String(ry) : ('00' + ry).slice(-3);
    return ryStr + '/' + m[2] + '/' + m[3];
  }
  m = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return pad2Date_(m[1]) + '/' + pad2Date_(m[2]);
  return s;
}

/**
 * 解析日期輸入 → 西元 yyyy-MM-dd
 * 民國：690808、0690808、1150806、69/08/08、民國69年8月8日
 * 西元：19800808、1980-08-08（相容舊資料）
 * 4 碼：MMDD（搭配 yearForMd；無則用今年）
 * emptyDefault：空值時回傳值；傳 null/undefined 且 allowEmpty 時回 ''
 */
function parseDateInputToYmd_(raw, emptyDefault) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) {
    return emptyDefault === undefined ? todayStr_() : emptyDefault;
  }
  s = s.replace(/^民國\s*/i, '').replace(/号/g, '日');

  var m = s.match(/^(\d{1,3})[\/\-.\s年](\d{1,2})[\/\-.\s月](\d{1,2})日?$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 999) {
    var gy = gregorianYearFromRoc_(m[1]);
    if (gy >= 1912 && gy <= 2100) {
      return gy + '-' + pad2Date_(m[2]) + '-' + pad2Date_(m[3]);
    }
  }
  m = s.match(/^(\d{4})[\/\-.\s年](\d{1,2})[\/\-.\s月](\d{1,2})日?$/);
  if (m) {
    return m[1] + '-' + pad2Date_(m[2]) + '-' + pad2Date_(m[3]);
  }

  var digits = s.replace(/\D/g, '');
  if (digits.length === 8) {
    return digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6, 8);
  }
  if (digits.length === 7) {
    return gregorianYearFromRoc_(digits.slice(0, 3)) + '-' + digits.slice(3, 5) + '-' + digits.slice(5, 7);
  }
  if (digits.length === 6) {
    return gregorianYearFromRoc_(digits.slice(0, 2)) + '-' + digits.slice(2, 4) + '-' + digits.slice(4, 6);
  }
  if (digits.length === 4) {
    var y = String(emptyDefault || todayStr_()).slice(0, 4);
    return y + '-' + digits.slice(0, 2) + '-' + digits.slice(2, 4);
  }
  return s;
}

function monthStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
}

/**
 * 產生週次選項（本週 + 過去 N 週）
 */
function listWeekOptions_(weeksBack) {
  weeksBack = Math.min(Math.max(Number(weeksBack) || 26, 0), 104);
  var cacheKey = 'weeks:' + weeksBack;
  var hit = cacheGet_(cacheKey);
  if (hit) return hit.slice();

  var now = new Date();
  var isoDow = Number(Utilities.formatDate(now, 'Asia/Taipei', 'u'));
  if (!isoDow || isoDow < 1 || isoDow > 7) {
    var js = now.getDay();
    isoDow = js === 0 ? 7 : js;
  }
  var ymd = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd').split('-');
  var local = new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]));
  var thisMonday = new Date(local);
  thisMonday.setDate(local.getDate() - (isoDow - 1));

  var fmt = function (x) {
    return Utilities.formatDate(x, 'Asia/Taipei', 'yyyy/MM/dd');
  };
  var out = [];
  for (var w = 0; w <= weeksBack; w++) {
    var monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - w * 7);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    var value = fmt(monday) + ' – ' + fmt(sunday);
    var tag = '';
    if (w === 0) tag = '（本週）';
    else if (w === 1) tag = '（上週）';
    else tag = '（' + w + ' 週前）';
    out.push({
      value: value,
      label: value + ' ' + tag,
      offset: w,
      isCurrent: w === 0
    });
  }
  cacheSet_(cacheKey, out);
  return out.slice();
}

function currentWeekLabel_() {
  return listWeekOptions_(0)[0].value;
}

function currentMonthLabel_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
}

/**
 * 從週次標籤（yyyy/MM/dd – yyyy/MM/dd）或 Date 取得該週週一（台北）
 */
function weekMondayFromPeriod_(periodOrDate) {
  if (periodOrDate instanceof Date && !isNaN(periodOrDate.getTime())) {
    var d0 = periodOrDate;
    var iso0 = Number(Utilities.formatDate(d0, 'Asia/Taipei', 'u'));
    if (!iso0 || iso0 < 1 || iso0 > 7) {
      var js0 = d0.getDay();
      iso0 = js0 === 0 ? 7 : js0;
    }
    var ymd0 = Utilities.formatDate(d0, 'Asia/Taipei', 'yyyy-MM-dd').split('-');
    var local0 = new Date(Number(ymd0[0]), Number(ymd0[1]) - 1, Number(ymd0[2]));
    local0.setDate(local0.getDate() - (iso0 - 1));
    return local0;
  }
  var s = String(periodOrDate || '').trim();
  var m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return weekMondayFromPeriod_(new Date());
}

/** 例：2026年 */
function yearFolderName_(monday) {
  var mon = weekMondayFromPeriod_(monday);
  return Utilities.formatDate(mon, 'Asia/Taipei', 'yyyy') + '年';
}

/** 例：8月活動 */
function monthActivityBucketName_(monday) {
  var mon = weekMondayFromPeriod_(monday);
  var month = Number(Utilities.formatDate(mon, 'Asia/Taipei', 'M'));
  return month + '月活動';
}

/**
 * 例：2026年8月第1週活動
 * 以該週週一所在月份計算「第幾週」：ceil(日/7)
 */
function yearMonthWeekActivityName_(monday) {
  var mon = weekMondayFromPeriod_(monday);
  var y = Utilities.formatDate(mon, 'Asia/Taipei', 'yyyy');
  var month = Number(Utilities.formatDate(mon, 'Asia/Taipei', 'M'));
  var day = Number(Utilities.formatDate(mon, 'Asia/Taipei', 'd'));
  var weekOfMonth = Math.ceil(day / 7);
  return y + '年' + month + '月第' + weekOfMonth + '週活動';
}

/**
 * 共用根：我的雲端硬碟／{年}／{N}月活動
 */
function ensureYearMonthActivityRoot_(period) {
  var monday = weekMondayFromPeriod_(period || currentWeekLabel_());
  var myDrive = DriveApp.getRootFolder();
  var yearFolder = findOrCreateSubfolder_(myDrive, yearFolderName_(monday));
  return findOrCreateSubfolder_(yearFolder, monthActivityBucketName_(monday));
}

/**
 * 本週活動：
 * 我的雲端硬碟／{年}／{N}月活動／{Y}年{M}月第W週活動
 */
function ensureThisWeekActivityFolder_(period) {
  var monday = weekMondayFromPeriod_(period || currentWeekLabel_());
  var monthRoot = ensureYearMonthActivityRoot_(monday);
  return findOrCreateSubfolder_(monthRoot, yearMonthWeekActivityName_(monday));
}

function activityDrivePathHint_(period) {
  var monday = weekMondayFromPeriod_(period || currentWeekLabel_());
  return '我的雲端硬碟／' + yearFolderName_(monday) + '／' +
    monthActivityBucketName_(monday) + '／' + yearMonthWeekActivityName_(monday);
}

/**
 * 本週講座：
 * 我的雲端硬碟／{年}／{N}月活動／本週講座／{日期}／{標題}
 */
function ensureLectureDriveFolder_(period, title, docDate) {
  var monthRoot = ensureYearMonthActivityRoot_(period || currentWeekLabel_());
  var lectureBucket = findOrCreateSubfolder_(monthRoot, '本週講座');
  var dateName = normalizeDocDate_(docDate);
  var dateFolder = findOrCreateSubfolder_(lectureBucket, dateName);
  var titleName = String(title || '').trim() || '未命名講座';
  return findOrCreateSubfolder_(dateFolder, titleName);
}

function lectureDrivePathHint_(period, title, docDate) {
  var monday = weekMondayFromPeriod_(period || currentWeekLabel_());
  var dateName = normalizeDocDate_(docDate);
  var titleName = String(title || '').trim() || '{標題}';
  return '我的雲端硬碟／' + yearFolderName_(monday) + '／' +
    monthActivityBucketName_(monday) + '／本週講座／' + dateName + '／' + titleName;
}

function parseJsonSafe_(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (e) {
    return fallback;
  }
}
