/**
 * DriveDocs — Google Sheets index layer
 */

/**
 * Open the DriveDocs spreadsheet (create if missing).
 * @return {Spreadsheet}
 */
function getSpreadsheet_() {
  var id = getProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // fall through to recreate
    }
  }
  var ss = SpreadsheetApp.create(CONFIG.APP_NAME + ' Index');
  setProp_(CONFIG.PROP_KEYS.SPREADSHEET_ID, ss.getId());
  ensureSheets_(ss);
  return ss;
}

/**
 * Ensure required sheets & headers exist.
 * @param {Spreadsheet} ss
 */
function ensureSheets_(ss) {
  ensureSheet_(ss, CONFIG.SHEETS.CUSTOMERS, [
    'id', 'name', 'phone', 'email', 'tags', 'notes',
    'folderId', 'createdAt', 'updatedAt', 'completion', 'zhuyin'
  ]);
  ensureSheet_(ss, CONFIG.SHEETS.SETTINGS, ['key', 'value']);
  ensureSheet_(ss, CONFIG.SHEETS.ACTIVITY, [
    'id', 'customerId', 'customerName', 'action', 'detail', 'createdAt'
  ]);
  ensureSheet_(ss, CONFIG.SHEETS.REPORTS, [
    'date', 'newCustomers', 'organized', 'missingDocs', 'updates'
  ]);

  // Remove default Sheet1 if empty unused
  var sheets = ss.getSheets();
  if (sheets.length > 4) {
    sheets.forEach(function (sh) {
      var n = sh.getName();
      if (
        n !== CONFIG.SHEETS.CUSTOMERS &&
        n !== CONFIG.SHEETS.SETTINGS &&
        n !== CONFIG.SHEETS.ACTIVITY &&
        n !== CONFIG.SHEETS.REPORTS
      ) {
        try {
          ss.deleteSheet(sh);
        } catch (e) { /* keep at least one */ }
      }
    });
  }
}

/**
 * @param {Spreadsheet} ss
 * @param {string} name
 * @param {string[]} headers
 * @return {Sheet}
 */
function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * @param {string} name
 * @return {Sheet}
 */
function getSheet_(name) {
  var ss = getSpreadsheet_();
  ensureSheets_(ss);
  return ss.getSheetByName(name);
}

/**
 * Read all data rows as objects keyed by header.
 * @param {string} sheetName
 * @return {Object[]}
 */
function sheetToObjects_(sheetName) {
  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    var empty = true;
    for (var j = 0; j < headers.length; j++) {
      var v = values[i][j];
      obj[headers[j]] = v;
      if (v !== '' && v !== null && v !== undefined) empty = false;
    }
    if (!empty) {
      obj._row = i + 1;
      rows.push(obj);
    }
  }
  return rows;
}

/**
 * Append a row object matching sheet headers.
 * @param {string} sheetName
 * @param {Object} obj
 */
function appendObject_(sheetName, obj) {
  var sh = getSheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    return obj[h] !== undefined && obj[h] !== null ? obj[h] : '';
  });
  sh.appendRow(row);
}

/**
 * Update a row by id column.
 * @param {string} sheetName
 * @param {string} id
 * @param {Object} patch
 * @return {boolean}
 */
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
        if (patch[h] !== undefined) {
          sh.getRange(i + 1, j + 1).setValue(patch[h]);
        }
      });
      return true;
    }
  }
  return false;
}

/**
 * Delete row by id.
 * @param {string} sheetName
 * @param {string} id
 * @return {boolean}
 */
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
      return true;
    }
  }
  return false;
}

/**
 * Settings get/set helpers.
 * @param {string} key
 * @param {*=} defaultValue
 * @return {*}
 */
function getSetting(key, defaultValue) {
  var rows = sheetToObjects_(CONFIG.SHEETS.SETTINGS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) {
      try {
        return JSON.parse(rows[i].value);
      } catch (e) {
        return rows[i].value;
      }
    }
  }
  return defaultValue;
}

/**
 * @param {string} key
 * @param {*} value
 */
function setSetting(key, value) {
  var sh = getSheet_(CONFIG.SHEETS.SETTINGS);
  var values = sh.getDataRange().getValues();
  var serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(serialized);
      return;
    }
  }
  sh.appendRow([key, serialized]);
}

/**
 * Generate a simple unique id.
 * @return {string}
 */
function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

/**
 * ISO timestamp in Taipei-friendly local format.
 * @return {string}
 */
function nowIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Today date string yyyy-MM-dd.
 * @return {string}
 */
function todayStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}
