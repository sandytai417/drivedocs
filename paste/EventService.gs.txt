/**
 * DriveDocs — 本週講座／本週活動
 *
 * 活動：我的雲端硬碟／{年}／{N}月活動／{Y}年{M}月第W週活動／（檔案直放）
 * 講座：我的雲端硬碟／{年}／{N}月活動／本週講座／{日期}／{標題}
 */

function listLectures() {
  return listEvents_(CONFIG.SHEETS.LECTURES);
}

function listActivities() {
  return listEvents_(CONFIG.SHEETS.ACTIVITIES);
}

function listEvents_(sheetName) {
  return sheetToObjects_(sheetName)
    .map(eventFromRow_)
    .sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

function eventFromRow_(row) {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    period: String(row.period || ''),
    notes: String(row.notes || ''),
    docDate: String(row.docDate || ''),
    files: parseJsonSafe_(row.files, []) || [],
    createdAt: String(row.createdAt || '')
  };
}

function createLecture(data) {
  return createEvent_(CONFIG.SHEETS.LECTURES, data, 'lecture', '本週講座');
}

function createActivity(data) {
  return createEvent_(CONFIG.SHEETS.ACTIVITIES, data, 'activity', '本週活動');
}

function createEvent_(sheetName, data, action, label) {
  var title = String(data.title || '').trim() || ('未命名' + (action === 'lecture' ? '講座' : '活動'));
  var period = String(data.period || '').trim() || currentWeekLabel_();
  var docDate = normalizeDocDate_(data.docDate || data.dataDate || data.date || todayStr_());
  var files = Array.isArray(data.files) ? data.files : [];
  var importMode = data.importMode === 'copy' ? 'copy' : (data.importMode === 'shortcut' ? 'shortcut' : 'move');

  var savedFiles = [];
  if (files.length) {
    var eventFolder = resolveEventDriveFolder_(action, label, period, title, docDate);
    files.forEach(function (f) {
      if (!f) return;
      var driveId = f.fileId || f.driveFileId || '';
      if (driveId) {
        try {
          var src = DriveApp.getFileById(String(driveId));
          var out = null;
          if (importMode === 'shortcut') {
            try { out = eventFolder.createShortcut(src.getId()); }
            catch (e0) { out = src.makeCopy(src.getName(), eventFolder); }
          } else if (importMode === 'move') {
            try { src.moveTo(eventFolder); out = src; }
            catch (e1) {
              eventFolder.addFile(src);
              out = src;
            }
          } else {
            out = src.makeCopy(src.getName(), eventFolder);
          }
          savedFiles.push({
            id: out.getId(),
            name: out.getName(),
            size: out.getSize(),
            url: out.getUrl(),
            mimeType: out.getMimeType(),
            createdAt: nowIso_()
          });
        } catch (e) {
          savedFiles.push({ id: newId_(), name: f.name || driveId, size: 0, error: String(e.message || e) });
        }
        return;
      }
      if (!f.base64Data || !f.name) {
        if (f.name) savedFiles.push({ id: f.id || newId_(), name: f.name, size: f.size || 0 });
        return;
      }
      try {
        validateUpload_(f.name, f.mimeType);
        var bytes = Utilities.base64Decode(f.base64Data);
        var blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', f.name);
        var file = eventFolder.createFile(blob);
        savedFiles.push({
          id: file.getId(),
          name: file.getName(),
          size: file.getSize(),
          url: file.getUrl(),
          mimeType: file.getMimeType(),
          createdAt: nowIso_()
        });
      } catch (e) {
        savedFiles.push({ id: newId_(), name: f.name, size: f.size || 0, error: String(e.message || e) });
      }
    });
  }

  var row = {
    id: newId_(),
    title: title,
    period: period,
    notes: String(data.notes || ''),
    docDate: action === 'lecture' ? docDate : '',
    files: JSON.stringify(savedFiles),
    createdAt: nowIso_()
  };
  appendObject_(sheetName, row);
  logActivity_('', title, action, label + ' · ' + title);
  bumpReport_('updates', 1);
  if (savedFiles.length) bumpReport_('organized', savedFiles.length);
  return eventFromRow_(row);
}

/**
 * 活動：我的雲端硬碟／{年}／{N}月活動／年月周活動
 * 講座：我的雲端硬碟／{年}／{N}月活動／本週講座／日期／標題
 */
function resolveEventDriveFolder_(action, label, period, title, docDate) {
  if (action === 'activity') {
    return ensureThisWeekActivityFolder_(period);
  }
  return ensureLectureDriveFolder_(period, title, docDate);
}

/**
 * 一鍵放入本週活動：不用填任何欄位
 * payload.files: local base64 或 {fileId/driveFileId}
 */
function quickAddToThisWeekActivity(payload) {
  payload = payload || {};
  var files = Array.isArray(payload.files) ? payload.files : [];
  if (!files.length) throw new Error('請先選檔案');

  var period = currentWeekLabel_();
  var stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'M/d HH:mm');
  var firstName = '';
  try {
    firstName = String(files[0].name || '').replace(/\.[^.]+$/, '');
  } catch (e) { firstName = ''; }
  var title = String(payload.title || '').trim() ||
    (firstName ? (firstName + '（' + stamp + '）') : ('本週活動 ' + stamp));

  return createActivity({
    title: title,
    period: period,
    notes: payload.notes || '',
    files: files,
    importMode: payload.importMode || 'move'
  });
}

/**
 * 週次下拉選單：本週 + 過去 N 週（預設 16，首頁更快）
 * 需要歷史期間時再合併既有紀錄
 */
function listWeekPeriodOptions(weeksBack, includeHistory) {
  weeksBack = weeksBack == null ? 16 : weeksBack;
  var options = listWeekOptions_(weeksBack);
  if (includeHistory === false) return options;

  var seen = {};
  options.forEach(function (o) { seen[o.value] = true; });

  var extra = [];
  listLectures().concat(listActivities()).forEach(function (ev) {
    var p = String(ev.period || '').trim();
    if (!p || seen[p]) return;
    seen[p] = true;
    extra.push({
      value: p,
      label: p + '（紀錄）',
      offset: null,
      isCurrent: false,
      fromHistory: true
    });
  });
  extra.sort(function (a, b) {
    return String(b.value).localeCompare(String(a.value));
  });
  return options.concat(extra);
}

function currentWeekLabel() {
  return currentWeekLabel_();
}

function currentMonthLabel() {
  return currentMonthLabel_();
}
