/**
 * DriveDocs — 示範資料（真實建立 Drive 資料夾）
 */

function seedDemoData() {
  var samples = [
    { name: '白雅婷', phone: '0912-345-678', email: 'pai@example.com', birthday: '1992-03-18', gender: '女', idNumber: 'A223456789', address: '台北市大安區復興南路一段100號', tags: ['客戶'] },
    { name: '包志明', phone: '0922-111-222', email: 'bao@example.com', birthday: '1988-11-02', gender: '男', idNumber: 'B123456789', address: '新北市板橋區文化路二段88號', tags: ['房仲'] },
    { name: '柏建豪', phone: '0933-888-999', email: 'bo@example.com', birthday: '1990-07-21', gender: '男', idNumber: 'C123456780', address: '台中市西屯區台灣大道三段200號', tags: ['財務'] },
    { name: '潘怡君', phone: '0918-555-666', email: 'pan@example.com', birthday: '1995-01-09', gender: '女', idNumber: 'D223456781', address: '高雄市左營區博愛二路66號', tags: ['客戶'] },
    { name: '馬志豪', phone: '0955-123-456', email: 'ma@example.com', birthday: '1985-05-30', gender: '男', idNumber: 'E123456782', address: '桃園市中壢區中正路50號', tags: ['會計'] },
    { name: '毛子恩', phone: '0966-777-888', email: 'mao@example.com', birthday: '1998-09-12', gender: '男', idNumber: 'F123456783', address: '台南市東區中華東路一段12號', tags: ['法律'] },
    { name: '王大明', phone: '0912-123-456', email: 'wang@example.com', birthday: '1980-08-08', gender: '男', idNumber: 'A123456789', address: '台北市信義區松仁路100號', tags: ['VIP'] },
    { name: '陳美玲', phone: '0977-222-333', email: 'chen@example.com', birthday: '1991-12-25', gender: '女', idNumber: 'H223456784', address: '新竹市東區光復路二段30號', tags: ['代書'] },
    { name: '林俊傑', phone: '0988-444-555', email: 'lin@example.com', birthday: '1987-04-14', gender: '男', idNumber: 'A123456790', address: '台北市中山區南京東路三段66號', tags: ['客戶'] },
    { name: '黃詩涵', phone: '0911-666-777', email: 'huang@example.com', birthday: '1993-06-06', gender: '女', idNumber: 'A223456791', address: '台中市南屯區公益路二段8號', tags: ['財務'] }
  ];

  var existing = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(function (r) {
    return String(r.name);
  });
  var created = [];

  samples.forEach(function (s) {
    if (existing.indexOf(s.name) !== -1) return;
    created.push(createCustomer(s));
  });

  var wang = null;
  sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).map(customerFromRow_).forEach(function (c) {
    if (c.name === '王大明') wang = c;
  });

  if (wang && wang.folderId) {
    seedPlaceholder_(wang.folderId, '01 基本資料', '身分證影本.pdf.txt', '示範檔：請替換成真實 PDF');
    seedPlaceholder_(wang.folderId, '02 保單', '保單.pdf.txt', '示範檔：保單');
    seedPlaceholder_(wang.folderId, '02 保單', '要保書.pdf.txt', '示範檔：要保書');
    seedPlaceholder_(wang.folderId, '05 財務規劃', '財務健檢摘要.pdf.txt', '示範檔');
    updateFolderMeta(wang.id, '01 基本資料', { required: true, done: true });
    updateFolderMeta(wang.id, '02 保單', { required: true, done: true });
    getCustomer(wang.id); // refresh fileCount
    logActivity_(wang.id, '王大明', 'upload', '上傳新文件 · 王大明 · 保單.pdf');
  }

  if (!listLectures().length) {
    createLecture({
      title: '退休金規劃講座',
      period: currentWeekLabel_(),
      notes: '示範講座'
    });
  }
  if (!listActivities().length) {
    createActivity({
      title: '客戶答謝午宴',
      period: currentWeekLabel_(),
      notes: '示範活動'
    });
  }

  try { seedAlignBirthdayThisWeek_(); } catch (e) { /* ignore */ }

  return {
    created: created.length,
    total: sheetToObjects_(CONFIG.SHEETS.CUSTOMERS).length,
    message: '已匯入示範客戶 ' + created.length + ' 位（含 Drive 資料夾）'
  };
}

/** 把「王大明」生日對齊本週某一天，方便示範壽星提醒 */
function seedAlignBirthdayThisWeek_() {
  var week = getWeekRangeTaipei_();
  var md = week.days[Math.min(2, week.days.length - 1)].md; // 週三優先
  var parts = md.split('-');
  var bday = '1980-' + parts[0] + '-' + parts[1];
  var rows = sheetToObjects_(CONFIG.SHEETS.CUSTOMERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].name) === '王大明') {
      updateObjectById_(CONFIG.SHEETS.CUSTOMERS, rows[i].id, { birthday: bday, updatedAt: nowIso_() });
      return;
    }
  }
}

function seedPlaceholder_(folderId, category, fileName, content) {
  var dateFolder = ensureCategoryDateFolder_(folderId, category, todayStr_());
  var cat = dateFolder;
  if (cat.getFilesByName(fileName).hasNext()) return;
  cat.createFile(Utilities.newBlob(content, 'text/plain', fileName));
}
