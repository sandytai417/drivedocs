(function () {
  'use strict';

  var state = {
    page: 'dashboard',
    sortBy: 'zhuyin',
    customerId: null,
    searchTimer: null,
    sidebarOpen: false,
    uploadPreset: null,
    searchQuery: ''
  };

  var TITLES = {
    dashboard: 'Dashboard',
    customers: 'Customers',
    upload: 'Upload',
    reports: 'Reports',
    settings: 'Settings',
    detail: '客戶詳情',
    search: '搜尋結果'
  };

  function $(id) { return document.getElementById(id); }

  function toast(msg, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' toast--error' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var s = String(iso);
    return s.length >= 10 ? s.slice(0, 10).replace(/-/g, '/') : s;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeSidebar() {
    state.sidebarOpen = false;
    $('sidebar').classList.remove('is-open');
  }

  function openModal(html) {
    var root = $('modal-root');
    root.innerHTML = '<div class="modal-backdrop" id="modal-backdrop"><div class="modal">' + html + '</div></div>';
    $('modal-backdrop').addEventListener('click', function (e) {
      if (e.target.id === 'modal-backdrop') root.innerHTML = '';
    });
  }

  function closeModal() { $('modal-root').innerHTML = ''; }

  function setPage(page, opts) {
    opts = opts || {};
    state.page = page;
    if (opts.customerId) state.customerId = opts.customerId;
    document.querySelectorAll('.nav__item').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-page') === page);
    });
    $('page-title').textContent = opts.title || TITLES[page] || page;
    closeSidebar();
    render();
  }

  function animateBars(root) {
    requestAnimationFrame(function () {
      root.querySelectorAll('[data-width]').forEach(function (el) {
        el.style.width = el.getAttribute('data-width') + '%';
      });
    });
  }

  function render() {
    var content = $('content');
    var actions = $('topbar-actions');
    actions.innerHTML = '';
    try {
      if (state.page === 'dashboard') renderDashboard(content, actions);
      else if (state.page === 'customers') renderCustomers(content, actions);
      else if (state.page === 'detail') renderDetail(content, actions);
      else if (state.page === 'upload') renderUpload(content, actions);
      else if (state.page === 'reports') renderReports(content, actions);
      else if (state.page === 'settings') renderSettings(content, actions);
      else if (state.page === 'search') renderSearch(content, actions);
      animateBars(content);
    } catch (err) {
      content.innerHTML = '<div class="panel"><p>' + escapeHtml(err.message || err) + '</p></div>';
      toast(err.message || String(err), true);
    }
  }

  function stat(label, value, hint) {
    return '<article class="stat">' +
      '<p class="stat__label">' + escapeHtml(label) + '</p>' +
      '<p class="stat__value">' + escapeHtml(String(value)) + '</p>' +
      (hint ? '<p class="stat__hint">' + escapeHtml(hint) + '</p>' : '') +
      '</article>';
  }

  function folderRow(c) {
    return '<button type="button" class="folder-row" data-id="' + escapeHtml(c.id) + '" data-name="' + escapeHtml(c.name) + '">' +
      '<span class="folder-icon" aria-hidden="true"></span>' +
      '<span><p class="folder-row__name">' + escapeHtml(c.name) + '</p>' +
      '<p class="folder-row__meta">' + escapeHtml(c.phone || '無電話') + ' · 更新 ' + escapeHtml(formatDate(c.updatedAt)) + '</p></span>' +
      '<span class="completion">' +
        '<div class="completion__bar"><div class="completion__fill" data-width="' + (c.completion || 0) + '"></div></div>' +
        '<div class="completion__pct">' + (c.completion || 0) + '%</div>' +
      '</span></button>';
  }

  function renderActivity(items) {
    if (!items.length) return '<p class="empty">尚無活動紀錄</p>';
    return '<ul class="activity">' + items.map(function (a) {
      return '<li class="activity__item" data-customer-id="' + escapeHtml(a.customerId) + '" data-name="' + escapeHtml(a.customerName) + '" style="cursor:pointer">' +
        '<span class="activity__check">✔</span>' +
        '<div><p class="activity__name">' + escapeHtml(a.customerName || '—') + '</p>' +
        '<p class="activity__detail">' + escapeHtml(a.detail) + '</p></div>' +
        '<span class="activity__time">' + escapeHtml(a.time || '') + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderDashboard(content, actions) {
    actions.innerHTML = '<button type="button" class="btn btn--primary" id="btn-new-customer">新增客戶</button>';
    var d = DriveDocsStore.getDashboard();
    content.innerHTML =
      '<section class="hero-strip">' +
        '<p class="hero-strip__brand">DriveDocs</p>' +
        '<p class="hero-strip__lead">Organize Client Documents Directly in Google Drive. 此為 GitHub Pages Demo，資料存在瀏覽器本機。</p>' +
      '</section>' +
      '<div class="stat-grid">' +
        stat('總客戶數', d.totalCustomers) +
        stat('今日新增', d.todayNew) +
        stat('今日整理', d.todayOrganized, '上傳／歸檔次數') +
        stat('待整理', d.pending, '完成度未滿 100%') +
        stat('文件完成率', d.completionRate + '%', '全體平均') +
        stat('最近更新', d.recentUpdates, '今日異動') +
      '</div>' +
      '<section class="panel"><h2 class="panel__title">Recent Activity</h2>' + renderActivity(d.activity || []) + '</section>';
    $('btn-new-customer').onclick = showCreateCustomerModal;
    content.querySelectorAll('[data-customer-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        setPage('detail', { customerId: el.getAttribute('data-customer-id'), title: el.getAttribute('data-name') });
      });
    });
  }

  function renderCustomers(content, actions) {
    actions.innerHTML = '<button type="button" class="btn btn--primary" id="btn-new-customer">新增客戶</button>';
    var data = DriveDocsStore.listCustomers(state.sortBy);
    var sort = data.sortBy || 'zhuyin';
    var toolbar =
      '<div class="toolbar"><div class="seg" id="sort-seg">' +
        segBtn('zhuyin', '注音', sort) +
        segBtn('updated', '最近更新', sort) +
        segBtn('created', '建立日期', sort) +
        segBtn('completion', '完成度', sort) +
      '</div><span style="color:var(--muted);font-size:0.88rem">共 ' + data.customers.length + ' 位客戶</span></div>';

    var body;
    if (!data.customers.length) {
      body = '<div class="panel"><p class="empty">尚未建立客戶。</p></div>';
    } else if (sort === 'zhuyin' && data.groups) {
      body = '<div class="explorer">' + data.groups.map(function (g) {
        return '<div class="zhuyin-group">' +
          '<div class="zhuyin-group__head"><span>' + escapeHtml(g.initial) + '</span><span class="zhuyin-group__rule"></span></div>' +
          g.customers.map(folderRow).join('') + '</div>';
      }).join('') + '</div>';
    } else {
      body = '<div class="explorer">' + data.customers.map(folderRow).join('') + '</div>';
    }

    content.innerHTML = toolbar + body;
    $('btn-new-customer').onclick = showCreateCustomerModal;
    $('sort-seg').onclick = function (e) {
      var btn = e.target.closest('button[data-sort]');
      if (!btn) return;
      state.sortBy = btn.getAttribute('data-sort');
      renderCustomers(content, actions);
      animateBars(content);
    };
    content.querySelectorAll('.folder-row').forEach(function (row) {
      row.addEventListener('click', function () {
        setPage('detail', { customerId: row.getAttribute('data-id'), title: row.getAttribute('data-name') });
      });
    });
  }

  function segBtn(value, label, current) {
    return '<button type="button" data-sort="' + value + '" class="' + (current === value ? 'is-active' : '') + '">' + label + '</button>';
  }

  function renderDetail(content, actions) {
    var data = DriveDocsStore.getCustomer(state.customerId);
    var c = data.customer;
    var comp = data.completion;
    $('page-title').textContent = c.name;
    actions.innerHTML =
      '<button type="button" class="btn btn--ghost" id="btn-back">← 客戶列表</button>' +
      '<button type="button" class="btn" id="btn-save">儲存</button>' +
      '<button type="button" class="btn btn--danger" id="btn-del">刪除</button>';

    var checklist = (comp.checklist || []).map(function (item) {
      return '<div class="checklist__item"><span class="' + (item.done ? 'ok' : 'no') + '">' +
        (item.done ? '✔' : '✘') + '</span><span>' + escapeHtml(item.category) + '</span></div>';
    }).join('');

    var cats = (data.categories || []).map(function (cat) {
      var files = (data.filesByCategory && data.filesByCategory[cat]) || [];
      var list = files.length
        ? '<ul class="file-list">' + files.map(function (f) {
            return '<li class="file-row"><div><p class="file-row__name">' + escapeHtml(f.name) + '</p>' +
              '<p class="file-row__meta">' + escapeHtml(formatDate(f.updatedAt)) + ' · Demo</p></div>' +
              '<div class="file-actions">' +
              '<button type="button" class="btn btn--ghost btn-preview">預覽</button>' +
              '<button type="button" class="btn btn--danger btn-del-file" data-file-id="' + escapeHtml(f.id) + '" data-file-name="' + escapeHtml(f.name) + '">刪除</button>' +
              '</div></li>';
          }).join('') + '</ul>'
        : '<p class="empty">尚無文件</p>';
      return '<section class="cat-block"><div class="cat-block__head"><span>' + escapeHtml(cat) + '</span>' +
        '<button type="button" class="btn btn--ghost btn-upload-here" data-cat="' + escapeHtml(cat) + '">上傳</button></div>' + list + '</section>';
    }).join('');

    content.innerHTML =
      '<div class="detail"><aside class="panel detail__side">' +
        '<div class="avatar">' + escapeHtml((c.name || '?').charAt(0)) + '</div>' +
        '<div class="field"><label>姓名</label><input id="c-name" value="' + escapeHtml(c.name) + '"></div>' +
        '<div class="field"><label>電話</label><input id="c-phone" value="' + escapeHtml(c.phone) + '"></div>' +
        '<div class="field"><label>Email</label><input id="c-email" value="' + escapeHtml(c.email) + '"></div>' +
        '<div class="field"><label>標籤（逗號分隔）</label><input id="c-tags" value="' + escapeHtml((c.tags || []).join(', ')) + '"></div>' +
        '<div class="field"><label>備註</label><textarea id="c-notes">' + escapeHtml(c.notes) + '</textarea></div>' +
        '<div class="completion" style="text-align:left;min-width:0">' +
          '<div class="completion__bar"><div class="completion__fill" data-width="' + comp.percent + '"></div></div>' +
          '<div class="completion__pct">完成度 ' + comp.percent + '%（' + comp.filled + '/' + comp.total + '）</div></div>' +
        '<div class="checklist">' + checklist + '</div></aside><div>' + cats + '</div></div>';

    $('btn-back').onclick = function () { setPage('customers'); };
    $('btn-save').onclick = function () {
      try {
        DriveDocsStore.updateCustomer(c.id, {
          name: $('c-name').value,
          phone: $('c-phone').value,
          email: $('c-email').value,
          tags: $('c-tags').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean),
          notes: $('c-notes').value
        });
        toast('已儲存');
        renderDetail(content, actions);
        animateBars(content);
      } catch (err) { toast(err.message || err, true); }
    };
    $('btn-del').onclick = function () {
      if (!confirm('確定刪除客戶「' + c.name + '」？')) return;
      DriveDocsStore.deleteCustomer(c.id);
      toast('已刪除');
      setPage('customers');
    };
    content.querySelectorAll('.btn-upload-here').forEach(function (btn) {
      btn.onclick = function () {
        state.uploadPreset = { customerId: c.id, category: btn.getAttribute('data-cat') };
        setPage('upload');
      };
    });
    content.querySelectorAll('.btn-preview').forEach(function (btn) {
      btn.onclick = function () { toast('Demo 模式：正式版會開啟 Google Drive 預覽'); };
    });
    content.querySelectorAll('.btn-del-file').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('刪除此文件？')) return;
        DriveDocsStore.deleteDocument({
          customerId: c.id,
          fileId: btn.getAttribute('data-file-id'),
          fileName: btn.getAttribute('data-file-name')
        });
        toast('已刪除文件');
        renderDetail(content, actions);
        animateBars(content);
      };
    });
  }

  function renderUpload(content) {
    var data = DriveDocsStore.listCustomers('zhuyin');
    var settings = DriveDocsStore.getSettings();
    var options = data.customers.map(function (c) {
      var sel = state.uploadPreset && state.uploadPreset.customerId === c.id ? ' selected' : '';
      return '<option value="' + escapeHtml(c.id) + '"' + sel + '>' + escapeHtml(c.name) + '</option>';
    }).join('');
    var catOpts = (settings.categories || []).map(function (cat) {
      var sel = state.uploadPreset && state.uploadPreset.category === cat ? ' selected' : '';
      return '<option value="' + escapeHtml(cat) + '"' + sel + '>' + escapeHtml(cat) + '</option>';
    }).join('');

    content.innerHTML =
      '<div class="dropzone" id="dropzone">' +
        '<p class="dropzone__title">拖曳上傳</p>' +
        '<p class="dropzone__hint">PDF · JPG · PNG · DOCX · XLSX（Demo 只記錄檔名，不存檔案內容）</p>' +
        '<p style="margin-top:1rem"><label class="btn btn--primary">選擇檔案<input type="file" id="file-input" hidden accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"></label></p>' +
      '</div>' +
      '<div class="upload-form panel" style="margin-top:1rem">' +
        '<div class="field"><label>客戶</label><select id="up-customer"><option value="">請選擇</option>' + options + '</select></div>' +
        '<div class="field"><label>分類</label><select id="up-category">' + catOpts + '</select></div>' +
        '<div class="field"><label>已選檔案</label><input id="up-filename" readonly placeholder="尚未選擇"></div>' +
        '<button type="button" class="btn btn--accent" id="btn-upload" disabled>Upload（Demo）</button>' +
      '</div>';

    var selectedFile = null;
    function pickFile(file) {
      if (!file) return;
      selectedFile = file;
      $('up-filename').value = file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
      $('btn-upload').disabled = false;
    }
    var dz = $('dropzone');
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('is-drag'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('is-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
    });
    $('file-input').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) pickFile(e.target.files[0]);
    });
    $('btn-upload').onclick = function () {
      try {
        var customerId = $('up-customer').value;
        if (!customerId) throw new Error('請選擇客戶');
        if (!selectedFile) throw new Error('請選擇檔案');
        DriveDocsStore.uploadDocument({
          customerId: customerId,
          category: $('up-category').value,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          size: selectedFile.size
        });
        toast('Demo：已記錄文件（非正式 Drive 上傳）');
        state.uploadPreset = null;
        setPage('detail', { customerId: customerId });
      } catch (err) { toast(err.message || err, true); }
    };
  }

  function renderReports(content) {
    var r = DriveDocsStore.getReports();
    content.innerHTML =
      '<section class="hero-strip" style="margin-bottom:1rem">' +
        '<p class="hero-strip__brand" style="font-size:2rem">每日整理</p>' +
        '<p class="hero-strip__lead">追蹤今日新增、整理完成與文件缺漏。</p></section>' +
      '<div class="stat-grid">' +
        stat('今日新增', r.today.newCustomers) +
        stat('整理完成', r.today.organized) +
        stat('缺少文件', r.today.missingDocs) +
        stat('最近更新', r.today.updates) +
        stat('總完成率', r.completionRate + '%') +
      '</div>' +
      '<div class="split-2"><section class="panel"><h2 class="panel__title">文件缺漏</h2>' +
        (r.missing.length
          ? '<ul class="missing-list">' + r.missing.map(function (m) {
              return '<li class="missing-item" data-id="' + escapeHtml(m.customerId) + '" data-name="' + escapeHtml(m.customerName) + '">' +
                '<div><p class="missing-item__name">' + escapeHtml(m.customerName) + '</p>' +
                '<p class="missing-item__cats">' + escapeHtml((m.missingCategories || []).join('、')) + '</p></div>' +
                '<span class="completion__pct">' + m.completion + '%</span></li>';
            }).join('') + '</ul>'
          : '<p class="empty">太好了，沒有缺件客戶</p>') +
      '</section><section class="panel"><h2 class="panel__title">近 14 日紀錄</h2>' +
        (r.history.length
          ? '<ul class="activity">' + r.history.map(function (h) {
              return '<li class="activity__item"><span class="activity__check">·</span><div>' +
                '<p class="activity__name">' + escapeHtml(h.date) + '</p>' +
                '<p class="activity__detail">新增 ' + h.newCustomers + ' · 整理 ' + h.organized + ' · 更新 ' + h.updates + '</p></div></li>';
            }).join('') + '</ul>'
          : '<p class="empty">尚無歷史資料</p>') +
      '</section></div>';
    content.querySelectorAll('.missing-item').forEach(function (el) {
      el.addEventListener('click', function () {
        setPage('detail', { customerId: el.getAttribute('data-id'), title: el.getAttribute('data-name') });
      });
    });
  }

  function renderSettings(content) {
    var s = DriveDocsStore.getSettings();
    content.innerHTML =
      '<div class="split-2"><section class="panel"><h2 class="panel__title">Google Drive（Demo 模擬）</h2>' +
        '<div class="field"><label>根目錄名稱</label><input id="s-root" value="' + escapeHtml(s.rootFolderName) + '"></div>' +
        '<div class="field"><label>命名規則</label><input id="s-naming" value="' + escapeHtml(s.namingRule) + '"></div>' +
        '<div class="field"><label>管理員</label><input id="s-admins" value="' + escapeHtml((s.admins || []).join(', ')) + '"></div>' +
      '</section><section class="panel"><h2 class="panel__title">資料夾模板 / 文件分類</h2>' +
        '<div class="cat-editor" id="cat-editor">' +
          (s.categories || []).map(function (cat) {
            return '<div class="cat-editor__row"><input value="' + escapeHtml(cat) + '">' +
              '<button type="button" class="btn btn--ghost btn-rm-cat">移除</button></div>';
          }).join('') +
        '</div>' +
        '<div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap">' +
          '<button type="button" class="btn" id="btn-add-cat">新增分類</button>' +
          '<button type="button" class="btn btn--primary" id="btn-save-settings">儲存設定</button>' +
        '</div></section></div>' +
      '<section class="panel" style="margin-top:1rem"><h2 class="panel__title">示範資料</h2>' +
        '<p style="color:var(--ink-soft);margin:0 0 0.85rem">重設瀏覽器內的示範客戶與活動紀錄。</p>' +
        '<button type="button" class="btn btn--accent" id="btn-seed">重設示範資料</button></section>';

    $('btn-add-cat').onclick = function () {
      var row = document.createElement('div');
      row.className = 'cat-editor__row';
      row.innerHTML = '<input value=""><button type="button" class="btn btn--ghost btn-rm-cat">移除</button>';
      $('cat-editor').appendChild(row);
      row.querySelector('.btn-rm-cat').onclick = function () { row.remove(); };
    };
    content.querySelectorAll('.btn-rm-cat').forEach(function (btn) {
      btn.onclick = function () { btn.parentElement.remove(); };
    });
    $('btn-save-settings').onclick = function () {
      try {
        DriveDocsStore.saveSettings({
          rootFolderName: $('s-root').value,
          namingRule: $('s-naming').value,
          categories: Array.prototype.map.call($('cat-editor').querySelectorAll('input'), function (inp) {
            return inp.value.trim();
          }).filter(Boolean),
          admins: $('s-admins').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean)
        });
        toast('設定已儲存');
      } catch (err) { toast(err.message || err, true); }
    };
    $('btn-seed').onclick = function () {
      DriveDocsStore.resetDemo();
      toast('已重設示範資料');
      setPage('dashboard');
    };
  }

  function renderSearch(content) {
    var res = DriveDocsStore.search(state.searchQuery || '');
    content.innerHTML =
      '<div class="search-results"><section class="panel"><h2 class="panel__title">客戶（' + res.customers.length + '）</h2>' +
        (res.customers.length ? '<div class="explorer">' + res.customers.map(folderRow).join('') + '</div>' : '<p class="empty">沒有符合的客戶</p>') +
      '</section><section class="panel"><h2 class="panel__title">文件（' + res.files.length + '）</h2>' +
        (res.files.length
          ? '<ul class="file-list">' + res.files.map(function (x) {
              return '<li class="file-row"><div><p class="file-row__name">' + escapeHtml(x.file.name) + '</p>' +
                '<p class="file-row__meta">' + escapeHtml(x.customerName) + ' · ' + escapeHtml(x.file.category) + '</p></div>' +
                '<div class="file-actions"><button type="button" class="btn btn-open-cust" data-id="' + escapeHtml(x.customerId) + '" data-name="' + escapeHtml(x.customerName) + '">開啟客戶</button></div></li>';
            }).join('') + '</ul>'
          : '<p class="empty">沒有符合的文件</p>') +
      '</section></div>';
    content.querySelectorAll('.folder-row, .btn-open-cust').forEach(function (el) {
      el.addEventListener('click', function () {
        setPage('detail', { customerId: el.getAttribute('data-id'), title: el.getAttribute('data-name') });
      });
    });
  }

  function showCreateCustomerModal() {
    openModal(
      '<h2>新增客戶</h2>' +
      '<div class="field"><label>姓名</label><input id="m-name" placeholder="王大明"></div>' +
      '<div class="field"><label>電話</label><input id="m-phone" placeholder="0912-123-456"></div>' +
      '<div class="field"><label>Email</label><input id="m-email" placeholder="name@example.com"></div>' +
      '<div class="field"><label>標籤</label><input id="m-tags" placeholder="保險, VIP"></div>' +
      '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" id="m-cancel">取消</button>' +
        '<button type="button" class="btn btn--primary" id="m-ok">建立</button></div>'
    );
    $('m-cancel').onclick = closeModal;
    $('m-ok').onclick = function () {
      try {
        var c = DriveDocsStore.createCustomer({
          name: $('m-name').value.trim(),
          phone: $('m-phone').value.trim(),
          email: $('m-email').value.trim(),
          tags: $('m-tags').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean)
        });
        closeModal();
        toast('已建立「' + c.name + '」');
        setPage('detail', { customerId: c.id, title: c.name });
      } catch (err) { toast(err.message || err, true); }
    };
  }

  function boot() {
    document.querySelectorAll('.nav__item').forEach(function (btn) {
      btn.addEventListener('click', function () { setPage(btn.getAttribute('data-page')); });
    });
    $('sidebar-toggle').addEventListener('click', function () {
      state.sidebarOpen = !state.sidebarOpen;
      $('sidebar').classList.toggle('is-open', state.sidebarOpen);
    });
    var search = $('global-search');
    search.addEventListener('input', function () {
      clearTimeout(state.searchTimer);
      var q = search.value.trim();
      state.searchTimer = setTimeout(function () {
        if (!q) {
          if (state.page === 'search') setPage('customers');
          return;
        }
        state.searchQuery = q;
        setPage('search', { title: '搜尋：' + q });
      }, 280);
    });

    DriveDocsStore.listCustomers('zhuyin');
    $('boot').classList.add('hidden');
    $('shell').classList.remove('hidden');
    setPage('dashboard');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
