/**
 * DriveDocs — Demo seed data for portfolio / first-run walkthrough
 */

/**
 * Seed sample Taiwanese clients + activity (no real files required).
 * Creates Drive folders so the explorer UX is real.
 * @return {Object}
 */
function seedDemoData() {
  var samples = [
    { name: '白雅婷', phone: '0912-345-678', email: 'pai@example.com', tags: ['保險'], notes: '旅平險續保客戶' },
    { name: '包志明', phone: '0922-111-222', email: 'bao@example.com', tags: ['房仲'], notes: '' },
    { name: '柏建豪', phone: '0933-888-999', email: 'bo@example.com', tags: ['財務'], notes: '退休規劃中' },
    { name: '潘怡君', phone: '0918-555-666', email: 'pan@example.com', tags: ['保險', '理賠'], notes: '' },
    { name: '馬志豪', phone: '0955-123-456', email: 'ma@example.com', tags: ['會計'], notes: '' },
    { name: '毛子恩', phone: '0966-777-888', email: 'mao@example.com', tags: ['法律'], notes: '委任合約待補' },
    { name: '王大明', phone: '0912-123-456', email: 'wang@example.com', tags: ['保險', 'VIP'], notes: '主要示範客戶' },
    { name: '陳美玲', phone: '0977-222-333', email: 'chen@example.com', tags: ['代書'], notes: '' },
    { name: '林俊傑', phone: '0988-444-555', email: 'lin@example.com', tags: ['保險'], notes: '' },
    { name: '黃詩涵', phone: '0911-666-777', email: 'huang@example.com', tags: ['財務'], notes: '' }
  ];

  var existing = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(function (r) {
    return String(r.name);
  });
  var created = [];

  samples.forEach(function (s) {
    if (existing.indexOf(s.name) !== -1) return;
    var c = createCustomer(s);
    created.push(c);
  });

  // Place a tiny placeholder text file into 王大明 / 01 基本資料 & 02 保單
  // so completion demo is visible (still Drive-native, not a site copy).
  var wang = null;
  var all = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(customerFromRow_);
  all.forEach(function (c) {
    if (c.name === '王大明') wang = c;
  });

  if (wang && wang.folderId) {
    seedPlaceholder_(wang.folderId, '01 基本資料', '身分證影本.txt', 'Demo placeholder — replace with PDF.');
    seedPlaceholder_(wang.folderId, '02 保單', '保單.pdf.txt', 'Demo placeholder for 保單.pdf');
    seedPlaceholder_(wang.folderId, '05 財務規劃', '財務健檢摘要.txt', 'Demo placeholder');
    var completion = computeCompletion(wang.folderId);
    updateObjectById_(CONFIG.SHEETS.CUSTOMERS, wang.id, {
      completion: completion.percent,
      updatedAt: nowIso_()
    });
    logActivity_(wang.id, '王大明', 'upload', '新增 保單.pdf');
  }

  return {
    created: created.length,
    total: sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).length,
    message: '已匯入示範客戶 ' + created.length + ' 位'
  };
}

/**
 * @param {string} folderId
 * @param {string} category
 * @param {string} fileName
 * @param {string} content
 */
function seedPlaceholder_(folderId, category, fileName, content) {
  var customerFolder = DriveApp.getFolderById(folderId);
  var cat = findOrCreateSubfolder_(customerFolder, category);
  var existing = cat.getFilesByName(fileName);
  if (existing.hasNext()) return;
  cat.createFile(Utilities.newBlob(content, 'text/plain', fileName));
}
