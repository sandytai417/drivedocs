/**
 * DriveDocs store — GitHub Pages demo
 * Completion is manual: required + done flags per folder category.
 */
(function (global) {
  'use strict';

  var KEY = 'drivedocs.v2';
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

  function defaultFolderMeta(categories) {
    var meta = {};
    (categories || DEFAULT_CATEGORIES).forEach(function (cat, i) {
      // First 4 required by default; last two optional (理賠/其他 style flexibility)
      var required = i < 4;
      meta[cat] = { required: required, done: false };
    });
    return meta;
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
      files: {},
      activity: [],
      reports: {}
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
      // migrate from v1 if present
      var old = localStorage.getItem('drivedocs.v1');
      if (old) {
        localStorage.removeItem('drivedocs.v1');
      }
    } catch (e) { /* ignore */ }
    return null;
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
      state.reports[date] = { newCustomers: 0, organized: 0, updates: 0 };
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
    state.activity = state.activity.slice(0, 100);
  }

  function computeCompletion(folderMeta) {
    var keys = Object.keys(folderMeta || {});
    var required = keys.filter(function (k) { return folderMeta[k].required; });
    if (!required.length) return 100;
    var done = required.filter(function (k) { return folderMeta[k].done; }).length;
    return Math.round((done / required.length) * 100);
  }

  function deriveStatus(completion, explicit) {
    if (explicit === 'paused') return 'paused';
    if (completion >= 100) return 'done';
    if (completion <= 0) return 'not_started';
    return 'in_progress';
  }

  function refreshCustomer(state, customerId) {
    var c = state.customers.find(function (x) { return x.id === customerId; });
    if (!c) return;
    if (!c.folderMeta) c.folderMeta = defaultFolderMeta(state.settings.categories);
    // ensure all categories exist in meta
    state.settings.categories.forEach(function (cat) {
      if (!c.folderMeta[cat]) c.folderMeta[cat] = { required: false, done: false };
    });
    c.completion = computeCompletion(c.folderMeta);
    if (c.status !== 'paused') {
      c.status = deriveStatus(c.completion, c.status);
    }
    c.fileCount = countFiles(state, customerId);
    c.updatedAt = c.updatedAt || nowIso();
  }

  function countFiles(state, customerId) {
    var byCat = state.files[customerId] || {};
    var n = 0;
    Object.keys(byCat).forEach(function (cat) { n += (byCat[cat] || []).length; });
    return n;
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
      demo: true
    };
    state.files[customerId][category].unshift(file);
    var c = state.customers.find(function (x) { return x.id === customerId; });
    if (c) c.updatedAt = nowIso();
    refreshCustomer(state, customerId);
    if (!silent) {
      logActivity(state, customerId, c ? c.name : '', 'upload', '上傳新文件 · ' + (c ? c.name : '') + ' · ' + meta.name);
      bumpReport(state, 'organized', 1);
      bumpReport(state, 'updates', 1);
    }
    return file;
  }

  function seed(state) {
    var samples = [
      { name: '白雅婷', phone: '0912-345-678', email: 'pai@example.com', tags: ['保險'] },
      { name: '包志明', phone: '0922-111-222', email: 'bao@example.com', tags: ['房仲'] },
      { name: '柏建豪', phone: '0933-888-999', email: 'bo@example.com', tags: ['財務'] },
      { name: '潘怡君', phone: '0918-555-666', email: 'pan@example.com', tags: ['保險'] },
      { name: '馬志豪', phone: '0955-123-456', email: 'ma@example.com', tags: ['會計'] },
      { name: '毛子恩', phone: '0966-777-888', email: 'mao@example.com', tags: ['法律'] },
      { name: '王大明', phone: '0912-123-456', email: 'wang@example.com', tags: ['保險', 'VIP'] },
      { name: '陳美玲', phone: '0977-222-333', email: 'chen@example.com', tags: ['代書'] },
      { name: '林俊傑', phone: '0988-444-555', email: 'lin@example.com', tags: ['保險'] },
      { name: '黃詩涵', phone: '0911-666-777', email: 'huang@example.com', tags: ['財務'] }
    ];

    samples.forEach(function (s, idx) {
      var id = uid();
      var now = nowIso();
      var folderMeta = defaultFolderMeta(state.settings.categories);
      // vary completion for demo
      if (s.name === '王大明') {
        folderMeta['01 基本資料'].done = true;
        folderMeta['02 保單'].done = true;
        folderMeta['03 保全文件'].done = true;
        folderMeta['04 理賠'].required = false;
        folderMeta['05 財務規劃'].required = true;
        folderMeta['05 財務規劃'].done = true;
      } else if (idx % 3 === 0) {
        folderMeta['01 基本資料'].done = true;
        folderMeta['02 保單'].done = true;
      } else if (idx % 3 === 1) {
        folderMeta['01 基本資料'].done = true;
      }

      var completion = computeCompletion(folderMeta);
      state.customers.push({
        id: id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        tags: s.tags,
        notes: '',
        createdAt: now,
        updatedAt: now,
        folderMeta: folderMeta,
        completion: completion,
        status: deriveStatus(completion),
        fileCount: 0,
        zhuyin: DriveDocsZhuyin.getZhuyinInitial(s.name)
      });
      state.files[id] = {};
      state.settings.categories.forEach(function (cat) { state.files[id][cat] = []; });
      logActivity(state, id, s.name, 'create_customer', '新增客戶 · ' + s.name);
      bumpReport(state, 'newCustomers', 1);
    });

    var wang = state.customers.find(function (c) { return c.name === '王大明'; });
    if (wang) {
      addFile(state, wang.id, '01 基本資料', { name: '身分證影本.pdf', mimeType: 'application/pdf', size: 240000 }, true);
      addFile(state, wang.id, '02 保單', { name: '保單.pdf', mimeType: 'application/pdf', size: 512000 }, true);
      addFile(state, wang.id, '02 保單', { name: '要保書.pdf', mimeType: 'application/pdf', size: 180000 }, true);
      addFile(state, wang.id, '05 財務規劃', { name: '財務健檢摘要.pdf', mimeType: 'application/pdf', size: 96000 }, true);
      logActivity(state, wang.id, '王大明', 'upload', '上傳新文件 · 王大明 · 保單.pdf');
      // fake time for activity display
      if (state.activity[0]) state.activity[0].time = '10:30';
    }

    // a few more demo files for type stats
    state.customers.slice(0, 4).forEach(function (c, i) {
      if (c.name === '王大明') return;
      addFile(state, c.id, '01 基本資料', { name: '身分證.pdf', mimeType: 'application/pdf', size: 120000 + i * 1000 }, true);
      if (i % 2 === 0) {
        addFile(state, c.id, '02 保單', { name: '保單副本.pdf', mimeType: 'application/pdf', size: 200000 }, true);
      }
    });
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
        s.customers.forEach(function (c) { refreshCustomer(s, c.id); });
      }
      if (data.admins) s.settings.admins = data.admins;
      save(s);
      return s.settings;
    },

    listCustomers: function (sortBy) {
      sortBy = sortBy || 'zhuyin';
      var s = getState();
      s.customers.forEach(function (c) { refreshCustomer(s, c.id); });
      save(s);
      var rows = s.customers.slice();
      if (sortBy === 'updated') {
        rows.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
      } else if (sortBy === 'completion') {
        rows.sort(function (a, b) { return b.completion - a.completion; });
      } else {
        rows.sort(function (a, b) { return DriveDocsZhuyin.compareByZhuyin(a.name, b.name); });
      }
      return {
        customers: rows,
        groups: sortBy === 'zhuyin' ? DriveDocsZhuyin.groupByZhuyin(rows) : null,
        sortBy: sortBy,
        initials: DriveDocsZhuyin.ZHUYIN_ORDER.filter(function (z) { return z !== '#'; })
      };
    },

    getCustomer: function (id) {
      var s = getState();
      var c = s.customers.find(function (x) { return x.id === id; });
      if (!c) throw new Error('找不到客戶');
      refreshCustomer(s, id);
      save(s);
      var categories = s.settings.categories;
      var filesByCategory = {};
      categories.forEach(function (cat) {
        filesByCategory[cat] = ((s.files[id] || {})[cat] || []).slice();
      });
      return {
        customer: c,
        categories: categories,
        filesByCategory: filesByCategory,
        folderMeta: c.folderMeta,
        completion: c.completion
      };
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
      var folderMeta = defaultFolderMeta(s.settings.categories);
      var row = {
        id: id,
        name: name,
        phone: data.phone || '',
        email: data.email || '',
        tags: data.tags || [],
        notes: data.notes || '',
        createdAt: now,
        updatedAt: now,
        folderMeta: folderMeta,
        completion: 0,
        status: 'not_started',
        fileCount: 0,
        zhuyin: DriveDocsZhuyin.getZhuyinInitial(name)
      };
      s.customers.push(row);
      s.files[id] = {};
      s.settings.categories.forEach(function (cat) { s.files[id][cat] = []; });
      logActivity(s, id, name, 'create_customer', '新增客戶 · ' + name);
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
      if (data.status !== undefined) c.status = data.status;
      c.updatedAt = nowIso();
      refreshCustomer(s, id);
      logActivity(s, id, c.name, 'update_customer', '更新客戶資料 · ' + c.name);
      bumpReport(s, 'updates', 1);
      save(s);
      return c;
    },

    updateFolderMeta: function (customerId, category, patch) {
      var s = getState();
      var c = s.customers.find(function (x) { return x.id === customerId; });
      if (!c) throw new Error('找不到客戶');
      if (!c.folderMeta) c.folderMeta = defaultFolderMeta(s.settings.categories);
      if (!c.folderMeta[category]) c.folderMeta[category] = { required: false, done: false };
      if (patch.required !== undefined) c.folderMeta[category].required = !!patch.required;
      if (patch.done !== undefined) c.folderMeta[category].done = !!patch.done;
      c.updatedAt = nowIso();
      // clear paused if user is actively marking progress
      if (c.status === 'paused' && patch.done) c.status = 'in_progress';
      refreshCustomer(s, customerId);
      bumpReport(s, 'updates', 1);
      if (patch.done) bumpReport(s, 'organized', 1);
      save(s);
      return { folderMeta: c.folderMeta, completion: c.completion, status: c.status };
    },

    deleteCustomer: function (id) {
      var s = getState();
      var c = s.customers.find(function (x) { return x.id === id; });
      if (!c) throw new Error('找不到客戶');
      s.customers = s.customers.filter(function (x) { return x.id !== id; });
      delete s.files[id];
      logActivity(s, id, c.name, 'delete_customer', '刪除客戶 · ' + c.name);
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
      if (allowed.indexOf(ext) === -1) throw new Error('不支援的檔案格式：.' + ext);
      var file = addFile(s, payload.customerId, payload.category, {
        name: payload.fileName,
        mimeType: payload.mimeType,
        size: payload.size || 0
      }, false);
      save(s);
      return { file: file, completion: s.customers.find(function (c) { return c.id === payload.customerId; }).completion };
    },

    deleteDocument: function (payload) {
      var s = getState();
      var byCat = s.files[payload.customerId] || {};
      Object.keys(byCat).forEach(function (cat) {
        byCat[cat] = byCat[cat].filter(function (f) { return f.id !== payload.fileId; });
      });
      var c = s.customers.find(function (x) { return x.id === payload.customerId; });
      if (c) c.updatedAt = nowIso();
      refreshCustomer(s, payload.customerId);
      logActivity(s, payload.customerId, c ? c.name : '', 'delete_file', '刪除文件 · ' + (payload.fileName || ''));
      bumpReport(s, 'updates', 1);
      save(s);
      return { ok: true };
    },

    search: function (query) {
      var q = String(query || '').trim().toLowerCase();
      var s = getState();
      if (!q) return { customers: [], files: [], query: query };
      var matchedCustomers = [];
      var matchedFiles = [];
      s.customers.forEach(function (c) {
        refreshCustomer(s, c.id);
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
      save(s);
      return { customers: matchedCustomers, files: matchedFiles, query: query };
    },

    getDashboard: function () {
      var s = getState();
      s.customers.forEach(function (c) { refreshCustomer(s, c.id); });
      save(s);
      var today = todayStr();
      var todayNew = 0;
      var sum = 0;
      var totalFiles = 0;
      var statusCount = { done: 0, in_progress: 0, paused: 0, not_started: 0 };
      s.customers.forEach(function (c) {
        if (String(c.createdAt).indexOf(today) === 0) todayNew++;
        sum += c.completion;
        totalFiles += c.fileCount || 0;
        var st = c.status || deriveStatus(c.completion);
        if (!statusCount[st]) statusCount[st] = 0;
        statusCount[st]++;
      });
      var report = s.reports[today] || { newCustomers: 0, organized: 0, updates: 0 };
      var typeStats = {};
      s.settings.categories.forEach(function (cat) { typeStats[cat] = 0; });
      Object.keys(s.files).forEach(function (cid) {
        Object.keys(s.files[cid] || {}).forEach(function (cat) {
          typeStats[cat] = (typeStats[cat] || 0) + (s.files[cid][cat] || []).length;
        });
      });

      return {
        totalCustomers: s.customers.length,
        todayOrganized: report.organized || 0,
        todayDone: report.organized || 0,
        completionRate: s.customers.length ? Math.round(sum / s.customers.length) : 0,
        totalFiles: totalFiles,
        todayNew: todayNew,
        activity: s.activity.slice(0, 10),
        statusCount: statusCount,
        typeStats: typeStats,
        categories: s.settings.categories.slice(),
        storageUsed: '8.24GB',
        storageTotal: '15GB',
        storagePct: Math.round(8.24 / 15 * 100)
      };
    },

    getReports: function () {
      var s = getState();
      var today = todayStr();
      var report = s.reports[today] || { newCustomers: 0, organized: 0, updates: 0 };
      var sum = 0;
      s.customers.forEach(function (c) {
        refreshCustomer(s, c.id);
        sum += c.completion;
      });
      save(s);
      var history = Object.keys(s.reports).sort().reverse().slice(0, 14).map(function (date) {
        var r = s.reports[date];
        return {
          date: date,
          newCustomers: r.newCustomers || 0,
          organized: r.organized || 0,
          updates: r.updates || 0
        };
      });
      return {
        today: {
          newCustomers: report.newCustomers || 0,
          organized: report.organized || 0,
          updates: report.updates || 0
        },
        completionRate: s.customers.length ? Math.round(sum / s.customers.length) : 0,
        history: history
      };
    }
  };

  global.DriveDocsStore = api;
})(window);
