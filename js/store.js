/**
 * DriveDocs — localStorage store (GitHub Pages demo)
 * Simulates Drive folders + Sheets index in the browser.
 */
(function (global) {
  'use strict';

  var KEY = 'drivedocs.v1';
  var DEFAULT_CATEGORIES = [
    '01 基本資料',
    '02 保單',
    '03 保全文件',
    '04 理賠',
    '05 財務規劃',
    '06 其他'
  ];

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16).slice(-6);
  }

  function nowIso() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function todayStr() {
    return nowIso().slice(0, 10);
  }

  function emptyState() {
    return {
      settings: {
        rootFolderName: '客戶資料',
        namingRule: '{name}',
        categories: DEFAULT_CATEGORIES.slice(),
        admins: ['demo@local']
      },
      customers: [],
      files: {},       // customerId -> { categoryName: [fileMeta...] }
      activity: [],
      reports: {}      // date -> counters
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function getState() {
    var s = load();
    if (!s) {
      s = emptyState();
      seed(s);
      save(s);
    }
    return s;
  }

  function bumpReport(state, field, delta) {
    var date = todayStr();
    if (!state.reports[date]) {
      state.reports[date] = { newCustomers: 0, organized: 0, missingDocs: 0, updates: 0 };
    }
    state.reports[date][field] = (state.reports[date][field] || 0) + delta;
  }

  function logActivity(state, customerId, customerName, action, detail) {
    state.activity.unshift({
      id: uid(),
      customerId: customerId || '',
      customerName: customerName || '',
      action: action,
      detail: detail,
      createdAt: nowIso(),
      time: nowIso().slice(11, 16)
    });
    state.activity = state.activity.slice(0, 80);
  }

  function completionFor(state, customerId) {
    var cats = state.settings.categories;
    var byCat = state.files[customerId] || {};
    var checklist = cats.map(function (cat) {
      var list = byCat[cat] || [];
      return { category: cat, done: list.length > 0, count: list.length };
    });
    var filled = checklist.filter(function (x) { return x.done; }).length;
    var percent = cats.length ? Math.round((filled / cats.length) * 100) : 0;
    return { percent: percent, filled: filled, total: cats.length, checklist: checklist };
  }

  function refreshCompletion(state, customerId) {
    var c = state.customers.find(function (x) { return x.id === customerId; });
    if (!c) return;
    c.completion = completionFor(state, customerId).percent;
    c.updatedAt = nowIso();
  }

  function seed(state) {
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

    samples.forEach(function (s) {
      var id = uid();
      var now = nowIso();
      state.customers.push({
        id: id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        tags: s.tags,
        notes: s.notes,
        createdAt: now,
        updatedAt: now,
        completion: 0,
        zhuyin: DriveDocsZhuyin.getZhuyinInitial(s.name)
      });
      state.files[id] = {};
      state.settings.categories.forEach(function (cat) {
        state.files[id][cat] = [];
      });
      logActivity(state, id, s.name, 'create_customer', '新增客戶');
      bumpReport(state, 'newCustomers', 1);
    });

    var wang = state.customers.find(function (c) { return c.name === '王大明'; });
    if (wang) {
      addFile(state, wang.id, '01 基本資料', {
        name: '身分證影本.pdf',
        mimeType: 'application/pdf',
        size: 120000
      }, true);
      addFile(state, wang.id, '02 保單', {
        name: '保單.pdf',
        mimeType: 'application/pdf',
        size: 240000
      }, true);
      addFile(state, wang.id, '05 財務規劃', {
        name: '財務健檢摘要.pdf',
        mimeType: 'application/pdf',
        size: 88000
      }, true);
      logActivity(state, wang.id, '王大明', 'upload', '新增 保單.pdf');
    }
  }

  function addFile(state, customerId, category, meta, silent) {
    if (!state.files[customerId]) state.files[customerId] = {};
    if (!state.files[customerId][category]) state.files[customerId][category] = [];
    var file = {
      id: uid(),
      name: meta.name,
      mimeType: meta.mimeType || 'application/octet-stream',
      size: meta.size || 0,
      category: category,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      // Demo: no real Drive URL — preview shows info toast
      demo: true
    };
    state.files[customerId][category].unshift(file);
    refreshCompletion(state, customerId);
    if (!silent) {
      var c = state.customers.find(function (x) { return x.id === customerId; });
      logActivity(state, customerId, c ? c.name : '', 'upload', '新增 ' + meta.name);
      bumpReport(state, 'organized', 1);
      bumpReport(state, 'updates', 1);
    }
    return file;
  }

  var api = {
    resetDemo: function () {
      var s = emptyState();
      seed(s);
      save(s);
      return s;
    },

    getSettings: function () {
      return getState().settings;
    },

    saveSettings: function (data) {
      var s = getState();
      if (data.rootFolderName) s.settings.rootFolderName = String(data.rootFolderName).trim();
      if (data.namingRule !== undefined) s.settings.namingRule = String(data.namingRule);
      if (data.categories && data.categories.length) {
        s.settings.categories = data.categories.map(function (c) { return String(c).trim(); }).filter(Boolean);
      }
      if (data.admins) s.settings.admins = data.admins;
      save(s);
      return s.settings;
    },

    listCustomers: function (sortBy) {
      sortBy = sortBy || 'zhuyin';
      var s = getState();
      var rows = s.customers.slice();
      if (sortBy === 'updated') {
        rows.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      } else if (sortBy === 'created') {
        rows.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      } else if (sortBy === 'completion') {
        rows.sort(function (a, b) { return b.completion - a.completion; });
      } else {
        rows.sort(function (a, b) { return DriveDocsZhuyin.compareByZhuyin(a.name, b.name); });
      }
      return {
        customers: rows,
        groups: sortBy === 'zhuyin' ? DriveDocsZhuyin.groupByZhuyin(rows) : null,
        sortBy: sortBy
      };
    },

    getCustomer: function (id) {
      var s = getState();
      var c = s.customers.find(function (x) { return x.id === id; });
      if (!c) throw new Error('找不到客戶');
      var categories = s.settings.categories;
      var filesByCategory = {};
      categories.forEach(function (cat) {
        filesByCategory[cat] = ((s.files[id] || {})[cat] || []).slice();
      });
      var completion = completionFor(s, id);
      c.completion = completion.percent;
      save(s);
      return { customer: c, categories: categories, filesByCategory: filesByCategory, completion: completion };
    },

    createCustomer: function (data) {
      var s = getState();
      var name = String(data.name || '').trim();
      if (!name) throw new Error('請輸入客戶姓名');
      if (s.customers.some(function (c) { return c.name === name; })) {
        throw new Error('客戶「' + name + '」已存在');
      }
      var id = uid();
      var now = nowIso();
      var row = {
        id: id,
        name: name,
        phone: data.phone || '',
        email: data.email || '',
        tags: data.tags || [],
        notes: data.notes || '',
        createdAt: now,
        updatedAt: now,
        completion: 0,
        zhuyin: DriveDocsZhuyin.getZhuyinInitial(name)
      };
      s.customers.push(row);
      s.files[id] = {};
      s.settings.categories.forEach(function (cat) { s.files[id][cat] = []; });
      logActivity(s, id, name, 'create_customer', '新增客戶');
      bumpReport(s, 'newCustomers', 1);
      bumpReport(s, 'updates', 1);
      save(s);
      return row;
    },

    updateCustomer: function (id, data) {
      var s = getState();
      var c = s.customers.find(function (x) { return x.id === id; });
      if (!c) throw new Error('找不到客戶');
      if (data.name !== undefined) {
        var newName = String(data.name).trim();
        if (!newName) throw new Error('請輸入客戶姓名');
        c.name = newName;
        c.zhuyin = DriveDocsZhuyin.getZhuyinInitial(newName);
      }
      if (data.phone !== undefined) c.phone = data.phone;
      if (data.email !== undefined) c.email = data.email;
      if (data.notes !== undefined) c.notes = data.notes;
      if (data.tags !== undefined) c.tags = data.tags;
      c.updatedAt = nowIso();
      logActivity(s, id, c.name, 'update_customer', '更新客戶資料');
      bumpReport(s, 'updates', 1);
      save(s);
      return c;
    },

    deleteCustomer: function (id) {
      var s = getState();
      var c = s.customers.find(function (x) { return x.id === id; });
      if (!c) throw new Error('找不到客戶');
      s.customers = s.customers.filter(function (x) { return x.id !== id; });
      delete s.files[id];
      logActivity(s, id, c.name, 'delete_customer', '刪除客戶');
      save(s);
      return { ok: true };
    },

    uploadDocument: function (payload) {
      var s = getState();
      if (!payload.customerId) throw new Error('缺少客戶');
      if (!payload.category) throw new Error('請選擇文件分類');
      if (!payload.fileName) throw new Error('缺少檔案');
      var ext = String(payload.fileName).split('.').pop().toLowerCase();
      var allowed = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'];
      if (allowed.indexOf(ext) === -1) {
        throw new Error('不支援的檔案格式：.' + ext);
      }
      var file = addFile(s, payload.customerId, payload.category, {
        name: payload.fileName,
        mimeType: payload.mimeType,
        size: payload.size || 0
      }, false);
      save(s);
      return { file: file, completion: completionFor(s, payload.customerId) };
    },

    deleteDocument: function (payload) {
      var s = getState();
      var byCat = s.files[payload.customerId] || {};
      Object.keys(byCat).forEach(function (cat) {
        byCat[cat] = byCat[cat].filter(function (f) { return f.id !== payload.fileId; });
      });
      refreshCompletion(s, payload.customerId);
      var c = s.customers.find(function (x) { return x.id === payload.customerId; });
      logActivity(s, payload.customerId, c ? c.name : '', 'delete_file', '刪除 ' + (payload.fileName || '文件'));
      bumpReport(s, 'updates', 1);
      save(s);
      return { ok: true, completion: completionFor(s, payload.customerId) };
    },

    search: function (query) {
      var q = String(query || '').trim().toLowerCase();
      var s = getState();
      if (!q) return { customers: [], files: [], query: query };
      var matchedCustomers = [];
      var matchedFiles = [];
      s.customers.forEach(function (c) {
        var hay = [c.name, c.phone, c.email, c.notes, c.zhuyin, (c.tags || []).join(' ')].join(' ').toLowerCase();
        var hit = hay.indexOf(q) !== -1;
        var fileHits = [];
        var byCat = s.files[c.id] || {};
        Object.keys(byCat).forEach(function (cat) {
          byCat[cat].forEach(function (f) {
            if (f.name.toLowerCase().indexOf(q) !== -1 || cat.toLowerCase().indexOf(q) !== -1) {
              fileHits.push({ customerId: c.id, customerName: c.name, file: f });
            }
          });
        });
        if (hit || fileHits.length) matchedCustomers.push(c);
        matchedFiles = matchedFiles.concat(fileHits);
      });
      matchedCustomers.sort(function (a, b) { return DriveDocsZhuyin.compareByZhuyin(a.name, b.name); });
      return { customers: matchedCustomers, files: matchedFiles, query: query };
    },

    getDashboard: function () {
      var s = getState();
      var today = todayStr();
      var todayNew = 0;
      var pending = 0;
      var sum = 0;
      s.customers.forEach(function (c) {
        if (String(c.createdAt).indexOf(today) === 0) todayNew++;
        if (c.completion < 100) pending++;
        sum += c.completion;
      });
      var report = s.reports[today] || { newCustomers: 0, organized: 0, missingDocs: 0, updates: 0 };
      return {
        totalCustomers: s.customers.length,
        todayNew: todayNew,
        todayOrganized: report.organized || 0,
        pending: pending,
        completionRate: s.customers.length ? Math.round(sum / s.customers.length) : 0,
        recentUpdates: report.updates || 0,
        activity: s.activity.slice(0, 12)
      };
    },

    getReports: function () {
      var s = getState();
      var today = todayStr();
      var report = s.reports[today] || { newCustomers: 0, organized: 0, missingDocs: 0, updates: 0 };
      var missing = [];
      var sum = 0;
      s.customers.forEach(function (c) {
        sum += c.completion;
        var comp = completionFor(s, c.id);
        if (comp.percent < 100) {
          missing.push({
            customerId: c.id,
            customerName: c.name,
            completion: comp.percent,
            missingCategories: comp.checklist.filter(function (x) { return !x.done; }).map(function (x) { return x.category; })
          });
        }
      });
      missing.sort(function (a, b) { return a.completion - b.completion; });
      var history = Object.keys(s.reports).sort().reverse().slice(0, 14).map(function (date) {
        var r = s.reports[date];
        return {
          date: date,
          newCustomers: r.newCustomers || 0,
          organized: r.organized || 0,
          missingDocs: r.missingDocs || 0,
          updates: r.updates || 0
        };
      });
      return {
        today: {
          newCustomers: report.newCustomers || 0,
          organized: report.organized || 0,
          missingDocs: missing.length,
          updates: report.updates || 0
        },
        completionRate: s.customers.length ? Math.round(sum / s.customers.length) : 0,
        missing: missing,
        history: history
      };
    }
  };

  global.DriveDocsStore = api;
})(window);
