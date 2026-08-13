/**
 * DriveDocs — 本週壽星提醒
 * 在總覽顯示本週生日客戶；可每週一自動寄信給自己。
 */

function pad2_(n) {
  n = Number(n) || 0;
  return n < 10 ? '0' + n : String(n);
}

/**
 * 生日正規化 → 儲存用西元 yyyy-MM-dd（或僅月日 MM-dd）
 * 輸入以民國為主：690808、0690808、69/08/08、民國69年8月8日
 * 亦相容西元 19800808；也可只填 0808（月日）
 */
function normalizeBirthday_(raw) {
  // 試算表常回傳 Date，先轉成 yyyy-MM-dd
  if (typeof coerceDateLikeToYmd_ === 'function') {
    var coerced = coerceDateLikeToYmd_(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(coerced))) return coerced;
    raw = coerced;
  } else if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
    try {
      return Utilities.formatDate(raw, 'Asia/Taipei', 'yyyy-MM-dd');
    } catch (e) { /* fall through */ }
  }

  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  s = s.replace(/^民國\s*/i, '');

  // 先解析含「年／月／日」或完整日期，避免 69年8月8日 被誤判成 4 碼月日
  if (typeof parseDateInputToYmd_ === 'function') {
    var ymd = parseDateInputToYmd_(s, '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return ymd;
  }
  var digits2 = s.replace(/\D/g, '');
  if (digits2.length === 8) {
    return digits2.slice(0, 4) + '-' + digits2.slice(4, 6) + '-' + digits2.slice(6, 8);
  }
  if (digits2.length === 7 && typeof gregorianYearFromRoc_ === 'function') {
    return gregorianYearFromRoc_(digits2.slice(0, 3)) + '-' + digits2.slice(3, 5) + '-' + digits2.slice(5, 7);
  }
  if (digits2.length === 6 && typeof gregorianYearFromRoc_ === 'function') {
    return gregorianYearFromRoc_(digits2.slice(0, 2)) + '-' + digits2.slice(2, 4) + '-' + digits2.slice(4, 6);
  }

  var m = s.match(/^(\d{1,2})[\/\-.\s月](\d{1,2})日?$/);
  if (m) return pad2_(m[1]) + '-' + pad2_(m[2]);
  if (digits2.length === 4) {
    return digits2.slice(0, 2) + '-' + digits2.slice(2, 4);
  }
  return s;
}

/** 生日顯示：民國69年8月8日（儲存仍為西元） */
function formatBirthdayDisplay_(raw) {
  var stored = normalizeBirthday_(raw);
  if (!stored) return '';
  var m = String(stored).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    var ry = Number(m[1]) - 1911;
    if (ry >= 1 && ry <= 999) {
      return '民國' + ry + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
    }
  }
  m = String(stored).match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return Number(m[1]) + '月' + Number(m[2]) + '日';
  return stored;
}

/**
 * 解析生日字串 → { year, month, day, md }；失敗回 null
 * year 為西元；輸入可為民國或西元
 */
function parseBirthdayParts_(raw) {
  var stored = normalizeBirthday_(raw);
  if (!stored) return null;
  var m = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      md: m[2] + '-' + m[3]
    };
  }
  m = stored.match(/^(\d{2})-(\d{2})$/);
  if (m) {
    return {
      year: null,
      month: Number(m[1]),
      day: Number(m[2]),
      md: m[1] + '-' + m[2]
    };
  }
  return null;
}

/**
 * 本週一～日（Asia/Taipei）
 */
function getWeekRangeTaipei_() {
  var now = new Date();
  var isoDow = Number(Utilities.formatDate(now, 'Asia/Taipei', 'u')); // 1=Mon … 7=Sun
  if (!isoDow || isoDow < 1 || isoDow > 7) {
    var js = now.getDay();
    isoDow = js === 0 ? 7 : js;
  }
  var ymd = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd').split('-');
  var local = new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]));
  var monday = new Date(local);
  monday.setDate(local.getDate() - (isoDow - 1));
  var sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  var days = [];
  var mdSet = {};
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    var md = pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
    mdSet[md] = true;
    days.push({
      date: Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd'),
      md: md,
      label: Utilities.formatDate(d, 'Asia/Taipei', 'M/d（E）')
    });
  }

  var fmt = function (x) {
    return Utilities.formatDate(x, 'Asia/Taipei', 'yyyy/MM/dd');
  };
  return {
    monday: monday,
    sunday: sunday,
    year: Number(ymd[0]),
    label: fmt(monday) + ' – ' + fmt(sunday),
    days: days,
    mdSet: mdSet
  };
}

function weekdayLabelForMd_(md, week) {
  for (var i = 0; i < week.days.length; i++) {
    if (week.days[i].md === md) return week.days[i].label;
  }
  return md;
}

/**
 * 本週壽星列表（依月日，忽略年份；跨年週次可正確處理）
 */
function listBirthdaysThisWeek() {
  var customers = filterRowsWithDriveFolder_(sheetToObjects_(CONFIG.SHEETS.CUSTOMERS)).map(function (r) {
    return customerFromRow_(r, { light: true });
  });
  return listBirthdaysFromCustomers_(customers);
}

/** 重用已載入的客戶陣列（首頁加速） */
function listBirthdaysFromCustomers_(customers) {
  var week = getWeekRangeTaipei_();
  var out = [];

  (customers || []).forEach(function (c) {
    var parts = parseBirthdayParts_(c.birthday);
    if (!parts) return;
    if (!week.mdSet[parts.md]) return;

    var age = null;
    if (parts.year) {
      age = week.year - parts.year;
      if (age < 0 || age > 130) age = null;
    }

    out.push({
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      birthday: c.birthday || '',
      birthdayDisplay: formatBirthdayDisplay_(c.birthday || ''),
      birthdayMd: parts.md,
      weekdayLabel: weekdayLabelForMd_(parts.md, week),
      age: age,
      zhuyin: c.zhuyin || ''
    });
  });

  out.sort(function (a, b) {
    return String(a.birthdayMd).localeCompare(String(b.birthdayMd)) ||
      String(a.name).localeCompare(String(b.name), 'zh-Hant');
  });

  return {
    weekLabel: week.label,
    count: out.length,
    customers: out
  };
}

function isBirthdayReminderEnabled_() {
  var v = getSetting('birthdayReminderEnabled', false);
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  return hasBirthdayReminderTrigger_();
}

function hasBirthdayReminderTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendWeeklyBirthdayReminder') return true;
  }
  return false;
}

function getBirthdayReminderStatus() {
  return {
    enabled: isBirthdayReminderEnabled_(),
    hasTrigger: hasBirthdayReminderTrigger_(),
    schedule: '每週一 09:00（台北時間）寄到你的 Gmail',
    week: listBirthdaysThisWeek()
  };
}

function enableWeeklyBirthdayReminder() {
  disableWeeklyBirthdayReminder_();
  ScriptApp.newTrigger('sendWeeklyBirthdayReminder')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .inTimezone('Asia/Taipei')
    .create();
  setSetting('birthdayReminderEnabled', true);
  return getBirthdayReminderStatus();
}

function disableWeeklyBirthdayReminder() {
  disableWeeklyBirthdayReminder_();
  setSetting('birthdayReminderEnabled', false);
  return getBirthdayReminderStatus();
}

function disableWeeklyBirthdayReminder_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendWeeklyBirthdayReminder') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * 寄送本週壽星提醒（給自己）。可由觸發器或手動呼叫。
 * @param {{force?:boolean}} opt force=true 時即使本週無人也寄摘要
 */
function sendWeeklyBirthdayReminder(opt) {
  opt = opt || {};
  var data = listBirthdaysThisWeek();
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  } catch (e) {
    email = '';
  }
  if (!email) {
    throw new Error('無法取得信箱，請重新授權後再試');
  }

  if (!data.count && !opt.force) {
    return {
      sent: false,
      skipped: true,
      message: '本週沒有壽星，已略過寄信',
      week: data
    };
  }

  var lines = [];
  lines.push('DriveDocs 本週壽星提醒');
  lines.push('週次：' + data.weekLabel);
  lines.push('');
  if (!data.count) {
    lines.push('本週沒有登記生日的客戶。');
  } else {
    lines.push('共 ' + data.count + ' 位：');
    data.customers.forEach(function (c, idx) {
      var age = c.age != null ? (' · 滿 ' + c.age + ' 歲') : '';
      lines.push(
        (idx + 1) + '. ' + c.name +
        ' · ' + c.weekdayLabel +
        ' · 生日 ' + formatBirthdayDisplay_(c.birthday || c.birthdayMd) +
        age +
        (c.phone ? (' · ' + c.phone) : '') +
        (c.email ? (' · ' + c.email) : '')
      );
    });
  }
  lines.push('');
  lines.push('— DriveDocs · 楊以寧');

  MailApp.sendEmail({
    to: email,
    subject: '【DriveDocs】本週壽星 ' + data.count + ' 位 · ' + data.weekLabel,
    body: lines.join('\n')
  });

  return {
    sent: true,
    skipped: false,
    message: '已寄送本週壽星提醒至 ' + email,
    to: email,
    week: data
  };
}
