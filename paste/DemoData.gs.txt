/**
 * DriveDocs — 清除虛構示範客戶（不再匯入假姓名）
 */

function demoCustomerNameSet_() {
  var hit = cacheGet_('demoNameSet');
  if (hit) return hit;
  var set = {};
  var names = (CONFIG && CONFIG.DEMO_CUSTOMER_NAMES) || [];
  for (var i = 0; i < names.length; i++) set[String(names[i])] = true;
  return cacheSet_('demoNameSet', set);
}

function isFabricatedCustomerRow_(row) {
  if (!row) return true;
  var email = String(row.email || '').toLowerCase();
  if (email.indexOf('@example.com') >= 0) return true;
  var name = String(row.name || '').trim();
  return !!(name && demoCustomerNameSet_()[name]);
}

/** 只改試算表索引，不掃 Drive（一次覆寫，避免逐列刪除拖慢啟動） */
function purgeFabricatedCustomersFromIndex_() {
  var sh = getSheet_(CONFIG.SHEETS.CUSTOMERS);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return 0;
  var headers = values[0];
  var nameCol = headers.indexOf('name');
  var emailCol = headers.indexOf('email');
  var kept = [headers];
  var removed = 0;
  for (var i = 1; i < values.length; i++) {
    var row = {
      name: nameCol >= 0 ? values[i][nameCol] : '',
      email: emailCol >= 0 ? values[i][emailCol] : ''
    };
    if (isFabricatedCustomerRow_(row)) removed++;
    else kept.push(values[i]);
  }
  if (!removed) return 0;
  var width = headers.length;
  sh.clearContents();
  sh.getRange(1, 1, kept.length, width).setValues(kept);
  invalidateSheetCache_(CONFIG.SHEETS.CUSTOMERS);
  return removed;
}

function seedDemoData() {
  var removed = 0;
  try { removed = purgeFabricatedCustomersFromIndex_(); } catch (e) { removed = 0; }
  return {
    created: 0,
    removed: removed,
    total: 0,
    message: '已停用示範客戶，並從列表移除虛構姓名 ' + removed + ' 筆。'
  };
}
