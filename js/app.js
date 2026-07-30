(function () {
  'use strict';

  var state = {
    page: 'dashboard',
    customerId: null,
    detailTab: 'folders',
    openFolder: null,
    zhuyinFilter: 'all',
    listQuery: '',
    uploadMode: 'existing', // existing | new
    uploadCustomerId: null,
    uploadCategory: '',
    uploadQueue: [],
    searchQuery: ''
  };

  function $(id) { return document.getElementById(id); }

  function toast(msg, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' toast--error' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var s = String(iso);
    return s.length >= 16
      ? s.slice(0, 16).replace('T', ' ').replace(/-/g, '/')
      : s.slice(0, 10).replace(/-/g, '/');
  }

  function formatSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function greetingText() {
    var h = new Date().getHours();
    if (h < 12) return '早安';
    if (h < 18) return '午安';
    return '晚安';
  }

  function privacyBlurb() {
    return '私人雲端相簿牆 — 單人使用、無個人檔案頁，Drive 是唯一檔案庫。';
  }

  function animateBars(root) {
    requestAnimationFrame(function () {
      (root || document).querySelectorAll('[data-width]').forEach(function (el) {
        el.style.width = el.getAttribute('data-width') + '%';
      });
    });
  }

  function setPage(page, opts) {
    opts = opts || {};
    state.page = page;
    if (opts.customerId) state.customerId = opts.customerId;
    if (opts.tab) state.detailTab = opts.tab;
    if (opts.openFolder !== undefined) state.openFolder = opts.openFolder;
    if (page === 'upload' && opts.customerId) state.uploadCustomerId = opts.customerId;
    if (page === 'upload' && opts.category) state.uploadCategory = opts.category;

    document.querySelectorAll('.menu__item').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-page') === page);
    });
    $('sidebar').classList.remove('is-open');
    render();
  }

  function render() {
    try {
      renderRail();
      var content = $('content');
      if (state.page === 'dashboard') renderDashboard(content);
      else if (state.page === 'customers') renderCustomers(content);
      else if (state.page === 'upload' || state.page === 'new-customer') renderUpload(content);
      else if (state.page === 'lectures') renderEvents(content, 'lecture');
      else if (state.page === 'activities') renderEvents(content, 'activity');
      else if (state.page === 'reports' || state.page === 'analytics') renderReports(content);
      else if (state.page === 'settings') renderSettings(content);
      else if (state.page === 'detail') renderDetail(content);
      else if (state.page === 'search') renderSearch(content);
      animateBars(document);
    } catch (err) {
      $('content').innerHTML = '<div class="card card__bd"><p>' + escapeHtml(err.message || err) + '</p></div>';
      toast(err.message || String(err), true);
    }
  }

  /* —— Right rail —— */
  function renderRail() {
    var d = DriveDocsStore.getDashboard();
    var total = d.totalCustomers || 1;
    var sc = d.statusCount || {};
    var p1 = Math.round((sc.done || 0) / total * 100);
    var p2 = Math.round((sc.in_progress || 0) / total * 100);
    var p3 = Math.round((sc.paused || 0) / total * 100);
    // remainder = not_started

    $('storage-fill').style.width = (d.storagePct || 55) + '%';
    $('storage-meta').textContent = d.storageUsed + ' / ' + d.storageTotal;

    var typeEntries = Object.keys(d.typeStats || {}).map(function (k) {
      return { name: k, count: d.typeStats[k] || 0 };
    }).filter(function (x) { return x.count > 0; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 6);
    var maxType = typeEntries.length ? typeEntries[0].count : 1;

    $('rail').innerHTML =
      '<section class="card">' +
        '<div class="card__hd"><div><h2 class="card__title">今日進度概覽</h2><p class="card__sub">客戶狀態分布</p></div></div>' +
        '<div class="card__bd"><div class="donut-wrap">' +
          '<div class="donut" style="--p1:' + p1 + ';--p2:' + p2 + ';--p3:' + p3 + '" data-center="' + d.completionRate + '%"></div>' +
          '<div class="legend">' +
            legendRow('done', '完成', sc.done || 0) +
            legendRow('progress', '進行中', sc.in_progress || 0) +
            legendRow('paused', '已暫停', sc.paused || 0) +
            legendRow('idle', '未開始', sc.not_started || 0) +
          '</div></div></div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card__hd"><div><h2 class="card__title">文件類型統計</h2><p class="card__sub">依分類累計</p></div></div>' +
        '<div class="card__bd"><div class="type-list">' +
          (typeEntries.length
            ? typeEntries.map(function (t) {
                var short = t.name.replace(/^\d+\s*/, '');
                return '<div><div class="type-row"><span>' + escapeHtml(short) + '</span><strong>' + t.count + '</strong></div>' +
                  '<div class="type-bar"><span style="width:' + Math.round(t.count / maxType * 100) + '%"></span></div></div>';
              }).join('')
            : '<p class="empty" style="padding:0.5rem 0">尚無文件</p>') +
        '</div></div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card__hd"><div><h2 class="card__title">資料夾模板</h2><p class="card__sub">新客戶預設結構</p></div></div>' +
        '<div class="card__bd"><ul class="template-list">' +
          (d.categories || []).map(function (cat) {
            return '<li><span class="folder-ico" style="width:22px;height:18px"></span>' + escapeHtml(cat) + '</li>';
          }).join('') +
        '</ul>' +
        '<button type="button" class="btn btn--ghost btn--block" style="margin-top:0.85rem" id="rail-edit-template">編輯模板</button>' +
        '</div>' +
      '</section>';

    var editBtn = $('rail-edit-template');
    if (editBtn) editBtn.onclick = function () { setPage('settings'); };
  }

  function legendRow(cls, label, value) {
    return '<div class="legend__row"><span class="legend__left"><span class="dot dot--' + cls + '"></span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  /* —— Dashboard —— */
  function renderDashboard(content) {
    var d = DriveDocsStore.getDashboard();
    var list = DriveDocsStore.listCustomers('zhuyin');
    var customers = filterCustomers(list.customers);

    content.innerHTML =
      '<section class="greeting">' +
        '<div class="polaroid-field" aria-hidden="true">' +
          '<span class="polaroid polaroid--1"></span>' +
          '<span class="polaroid polaroid--2"></span>' +
          '<span class="polaroid polaroid--3"></span>' +
          '<span class="polaroid polaroid--4"></span>' +
          '<span class="polaroid polaroid--5"></span>' +
          '<span class="polaroid polaroid--6"></span>' +
        '</div>' +
        '<p class="greeting__eyebrow">DRIVEDOCS</p>' +
        '<h1>' + greetingText() + '</h1>' +
        '<p>' + privacyBlurb() + '</p>' +
        '<div class="greeting__actions">' +
          '<button type="button" class="btn btn--primary" id="hero-upload">新增／上傳</button>' +
          '<button type="button" class="btn" id="hero-customers">瀏覽客戶</button>' +
        '</div>' +
      '</section>' +

      '<div class="feature-grid">' +
        '<button type="button" class="feature-card" data-go="customers">' +
          '<div class="feature-card__media feature-card__media--1"></div>' +
          '<div class="feature-card__label">依注音瀏覽</div>' +
        '</button>' +
        '<button type="button" class="feature-card" data-go="upload">' +
          '<div class="feature-card__media feature-card__media--2"></div>' +
          '<div class="feature-card__label">新增與上傳</div>' +
        '</button>' +
        '<button type="button" class="feature-card" data-go="reports">' +
          '<div class="feature-card__media feature-card__media--3"></div>' +
          '<div class="feature-card__label">每月回報</div>' +
        '</button>' +
      '</div>' +

      '<div class="overview">' +
        statCard('·', d.totalCustomers, '客戶總數') +
        statCard('↑', d.todayOrganized, '今日整理') +
        statCard('✔', d.todayDone, '今日完成') +
        statCard('%', d.completionRate + '%', '完成率') +
        statCard('▣', d.totalFiles, '文件總計') +
      '</div>' +

      '<div class="stack">' +
        '<section class="card">' +
          '<div class="card__hd"><div><h2 class="card__title">最近更新</h2><p class="card__sub">Recent activity</p></div>' +
          '<button type="button" class="card__link" id="view-all-activity">查看全部</button></div>' +
          '<div class="card__bd">' + renderActivity(d.activity) + '</div>' +
        '</section>' +
        renderCustomerListCard(list, customers) +
      '</div>';

    $('view-all-activity').onclick = function () { setPage('reports'); };
    $('hero-upload').onclick = function () { state.uploadMode = 'new'; setPage('upload'); };
    $('hero-customers').onclick = function () { setPage('customers'); };
    content.querySelectorAll('.feature-card[data-go]').forEach(function (el) {
      el.onclick = function () {
        var go = el.getAttribute('data-go');
        if (go === 'upload') state.uploadMode = 'new';
        setPage(go);
      };
    });
    bindCustomerList(content, list);
  }

  function statCard(ico, value, label) {
    return '<article class="card stat"><div class="stat__ico">' + ico + '</div>' +
      '<p class="stat__value">' + escapeHtml(String(value)) + '</p>' +
      '<p class="stat__label">' + escapeHtml(label) + '</p></article>';
  }

  function renderActivity(items) {
    if (!items || !items.length) return '<p class="empty">尚無活動</p>';
    return '<ul class="activity">' + items.slice(0, 6).map(function (a) {
      var desc = a.detail || '';
      // Prefer "上傳新文件 / 客戶 / 檔名" style when possible
      return '<li class="activity__item" data-id="' + escapeHtml(a.customerId) + '">' +
        '<div class="activity__ico">↑</div>' +
        '<div><p class="activity__title">' + escapeHtml(desc.split('·')[0].trim() || '更新') + '</p>' +
        '<p class="activity__desc">' + escapeHtml(a.customerName || '') + (desc.indexOf('·') >= 0 ? ' · ' + escapeHtml(desc.split('·').slice(1).join('·').trim()) : '') + '</p></div>' +
        '<div class="activity__time">' + escapeHtml(a.time || '') + '</div></li>';
    }).join('') + '</ul>';
  }

  /* —— Customers —— */
  function renderCustomers(content) {
    var list = DriveDocsStore.listCustomers('zhuyin');
    var customers = filterCustomers(list.customers);
    content.innerHTML = '<div class="stack">' + renderCustomerListCard(list, customers) + '</div>';
    bindCustomerList(content, list);
  }

  function filterCustomers(customers) {
    var q = (state.listQuery || '').trim().toLowerCase();
    return customers.filter(function (c) {
      if (state.zhuyinFilter !== 'all' && c.zhuyin !== state.zhuyinFilter) return false;
      if (!q) return true;
      var hay = [c.name, c.phone, c.email, c.birthday, c.address, c.idNumber, c.gender].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function renderCustomerListCard(list, customers) {
    var initials = ['全部'].concat((list.initials || []).filter(function (z) {
      return list.customers.some(function (c) { return c.zhuyin === z; });
    }));

    return '<section class="card">' +
      '<div class="card__hd"><div><h2 class="card__title">客戶列表</h2><p class="card__sub">依注音排序</p></div></div>' +
      '<div class="card__bd">' +
        '<div class="toolbar">' +
          '<div class="pills" id="zhuyin-pills">' +
            initials.map(function (label) {
              var value = label === '全部' ? 'all' : label;
              return '<button type="button" class="pill' + (state.zhuyinFilter === value ? ' is-active' : '') + '" data-z="' + escapeHtml(value) + '">' + escapeHtml(label) + '</button>';
            }).join('') +
          '</div>' +
          '<div class="toolbar__right">' +
            '<input class="mini-search" id="list-search" placeholder="姓名／地址／生日／身分證" value="' + escapeHtml(state.listQuery) + '">' +
            '<button type="button" class="btn btn--primary" id="btn-add-customer">新增／上傳</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-wrap"><table class="table"><thead><tr>' +
          '<th>姓名</th><th>電話</th><th>性別</th><th>生日</th><th>完成率</th><th>文件</th><th>狀態</th><th>最後更新</th><th></th>' +
        '</tr></thead><tbody>' +
        (customers.length ? customers.map(customerRow).join('') : '<tr><td colspan="9"><p class="empty">沒有符合的客戶</p></td></tr>') +
        '</tbody></table></div>' +
      '</div></section>';
  }

  function customerRow(c) {
    var done = c.completion >= 100;
    var statusBadge = c.isRenewal || c.fileCount > 1
      ? '<span class="badge badge--renewal">續保</span>'
      : '<span class="badge badge--new">新件</span>';
    return '<tr data-id="' + escapeHtml(c.id) + '">' +
      '<td><div class="cell-name">' + escapeHtml(c.name) +
      '<span style="color:var(--muted);font-weight:500;font-size:0.75rem;margin-left:0.35rem">' +
      escapeHtml(c.zhuyin || '') + '/' + escapeHtml(DriveDocsZhuyin.getGivenNameZhuyin(c.name)) +
      '</span></div></td>' +
      '<td>' + escapeHtml(c.phone || '—') + '</td>' +
      '<td>' + escapeHtml(c.gender || '—') + '</td>' +
      '<td>' + escapeHtml(c.birthday || '—') + '</td>' +
      '<td><div class="progress"><div class="progress__bar"><div class="progress__fill' + (done ? ' is-done' : '') + '" data-width="' + c.completion + '"></div></div>' +
      '<span class="progress__pct">' + c.completion + '%</span></div></td>' +
      '<td>' + (c.fileCount || 0) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + escapeHtml(formatDate(c.updatedAt)) + '</td>' +
      '<td><button type="button" class="more-btn" data-more="' + escapeHtml(c.id) + '">⋯</button></td>' +
      '</tr>';
  }

  function bindCustomerList(content, list) {
    var pills = content.querySelector('#zhuyin-pills');
    if (pills) {
      pills.onclick = function (e) {
        var btn = e.target.closest('.pill');
        if (!btn) return;
        state.zhuyinFilter = btn.getAttribute('data-z');
        render();
      };
    }
    var search = content.querySelector('#list-search');
    if (search) {
      search.oninput = function () {
        state.listQuery = search.value;
        // soft re-filter without full rail rebuild noise
        render();
        var el = $('list-search');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      };
    }
    var add = content.querySelector('#btn-add-customer');
    if (add) add.onclick = function () { state.uploadMode = 'new'; setPage('upload'); };

    content.querySelectorAll('tbody tr[data-id]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('.more-btn')) return;
        setPage('detail', { customerId: row.getAttribute('data-id'), tab: 'folders', openFolder: null });
      });
    });
    content.querySelectorAll('.more-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openMoreMenu(btn.getAttribute('data-more'));
      };
    });
    content.querySelectorAll('.activity__item[data-id]').forEach(function (el) {
      el.onclick = function () {
        if (el.getAttribute('data-id')) {
          setPage('detail', { customerId: el.getAttribute('data-id'), tab: 'folders' });
        }
      };
    });
  }

  function openMoreMenu(customerId) {
    openModal(
      '<h2>客戶操作</h2>' +
      '<div style="display:grid;gap:0.5rem">' +
        '<button type="button" class="btn" id="m-open">開啟資料夾</button>' +
        '<button type="button" class="btn" id="m-upload">上傳文件</button>' +
        '<button type="button" class="btn btn--danger" id="m-del">刪除客戶</button>' +
      '</div>' +
      '<div class="modal__actions"><button type="button" class="btn" id="m-cancel">關閉</button></div>'
    );
    $('m-cancel').onclick = closeModal;
    $('m-open').onclick = function () {
      closeModal();
      setPage('detail', { customerId: customerId, tab: 'folders' });
    };
    $('m-upload').onclick = function () {
      closeModal();
      state.uploadCustomerId = customerId;
      state.uploadMode = 'existing';
      setPage('upload');
    };
    $('m-del').onclick = function () {
      if (!confirm('確定刪除此客戶？')) return;
      DriveDocsStore.deleteCustomer(customerId);
      closeModal();
      toast('已刪除');
      render();
    };
  }

  /* —— Upload 3-step —— */
  function renderUpload(content) {
    var settings = DriveDocsStore.getSettings();
    var customers = DriveDocsStore.listCustomers('zhuyin').customers;
    var defaultType = settings.categories[0] || '01 基本資料';
    if (!state.uploadCategory) state.uploadCategory = defaultType;
    var selected = customers.find(function (c) { return c.id === state.uploadCustomerId; });

    var options = customers.map(function (c) {
      return '<option value="' + escapeHtml(c.id) + '"' + (state.uploadCustomerId === c.id ? ' selected' : '') + '>' + escapeHtml(c.name) + ' · ' + escapeHtml(c.phone || '') + '</option>';
    }).join('');

    var typeOpts = (settings.categories || []).map(function (cat) {
      return '<option value="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</option>';
    }).join('');

    content.innerHTML =
      '<section class="greeting"><h1>新增／上傳</h1><p>客戶資料與文件上傳同一頁完成 · 含姓名、電話、Email、生日</p></section>' +
      '<div class="upload-grid">' +
        '<section class="card">' +
          '<div class="card__hd"><div><h2 class="card__title">客戶資料</h2><p class="card__sub">可選擇既有客戶，或直接填寫新增</p></div></div>' +
          '<div class="card__bd">' +
            '<div class="mode-switch">' +
              '<button type="button" class="mode' + (state.uploadMode !== 'new' ? ' is-active' : '') + '" data-mode="existing">' +
                '<p class="mode__title">選擇既有客戶</p><p class="mode__desc">帶入資料後上傳</p></button>' +
              '<button type="button" class="mode' + (state.uploadMode === 'new' ? ' is-active' : '') + '" data-mode="new">' +
                '<p class="mode__title">新增客戶</p><p class="mode__desc">填寫後建立並上傳</p></button>' +
            '</div>' +
            (state.uploadMode !== 'new'
              ? '<div class="field"><label>既有客戶</label><select id="up-customer"><option value="">請選擇</option>' + options + '</select></div>'
              : '') +
            '<div class="field-row">' +
              '<div class="field"><label>姓名</label><input id="n-name" placeholder="王大明" value="' + escapeHtml(selected ? selected.name : '') + '"' + (state.uploadMode !== 'new' && selected ? ' readonly' : '') + '></div>' +
              '<div class="field"><label>電話</label><input id="n-phone" placeholder="0912-123-456" value="' + escapeHtml(selected ? selected.phone : '') + '"' + (state.uploadMode !== 'new' && selected ? ' readonly' : '') + '></div>' +
            '</div>' +
            '<div class="field-row">' +
              '<div class="field"><label>Email</label><input id="n-email" placeholder="name@example.com" value="' + escapeHtml(selected ? (selected.email || '') : '') + '"' + (state.uploadMode !== 'new' && selected ? ' readonly' : '') + '></div>' +
              '<div class="field"><label>生日</label><input id="n-birthday" type="date" value="' + escapeHtml(selected ? (selected.birthday || '') : '') + '"' + (state.uploadMode !== 'new' && selected ? ' readonly' : '') + '></div>' +
            '</div>' +
            '<div class="field-row">' +
              '<div class="field"><label>性別</label><select id="n-gender"' + (state.uploadMode !== 'new' && selected ? ' disabled' : '') + '>' +
                '<option value="">請選擇</option>' +
                '<option value="男"' + (selected && selected.gender === '男' ? ' selected' : '') + '>男</option>' +
                '<option value="女"' + (selected && selected.gender === '女' ? ' selected' : '') + '>女</option>' +
                '<option value="其他"' + (selected && selected.gender === '其他' ? ' selected' : '') + '>其他</option>' +
              '</select></div>' +
              '<div class="field"><label>身分證號</label><input id="n-id" placeholder="A123456789" value="' + escapeHtml(selected ? (selected.idNumber || '') : '') + '"' + (state.uploadMode !== 'new' && selected ? ' readonly' : '') + '></div>' +
            '</div>' +
            '<div class="field"><label>地址</label><input id="n-address" placeholder="縣市／區／路街門牌" value="' + escapeHtml(selected ? (selected.address || '') : '') + '"' + (state.uploadMode !== 'new' && selected ? ' readonly' : '') + '></div>' +
            (state.uploadMode === 'new'
              ? '<button type="button" class="btn btn--primary" id="btn-create-select">建立客戶</button>'
              : '') +
            (selected ? '<div class="upload-hint" style="margin-top:0.85rem">目前客戶：<strong>' + escapeHtml(selected.name) + '</strong>' +
              (selected.isRenewal || selected.fileCount > 1 ? ' <span class="badge badge--renewal">續保</span>' : ' <span class="badge badge--new">新件</span>') +
              (selected.birthday ? ' · 生日 ' + escapeHtml(selected.birthday) : '') +
              (selected.idNumber ? ' · ' + escapeHtml(selected.idNumber) : '') +
              '</div>' : '') +
          '</div>' +
        '</section>' +

        '<section class="card">' +
          '<div class="card__hd"><div><h2 class="card__title">上傳文件</h2><p class="card__sub">每個檔案可選擇文件類型</p></div></div>' +
          '<div class="card__bd">' +
            '<div class="field"><label>預設文件類型</label><select id="up-default-type">' +
              (settings.categories || []).map(function (cat) {
                return '<option value="' + escapeHtml(cat) + '"' + (state.uploadCategory === cat ? ' selected' : '') + '>' + escapeHtml(cat) + '</option>';
              }).join('') +
            '</select></div>' +
            '<div class="dropzone" id="dropzone">' +
              '<p class="dropzone__title">Drag & Drop</p>' +
              '<p class="dropzone__hint">PDF · PNG · JPG · DOCX · XLSX</p>' +
              '<p style="margin-top:1rem"><label class="btn btn--primary">選擇檔案<input type="file" id="file-input" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"></label></p>' +
            '</div>' +
            '<div style="margin-top:1rem" id="queue-box">' + renderQueue(typeOpts) + '</div>' +
            '<div class="upload-hint" id="upload-target-hint">' + uploadHint(selected) + '</div>' +
            '<div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end">' +
              '<button type="button" class="btn btn--primary" id="btn-start-upload">建立／上傳到 Drive</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';

    bindUpload(content, typeOpts);
  }

  function step(n, title, current) {
    return '<div class="step' + (current ? ' is-current' : '') + '"><div class="step__n">STEP ' + n + '</div><p class="step__t">' + title + '</p></div>';
  }

  function uploadHint(selected) {
    var settings = DriveDocsStore.getSettings();
    var name = selected ? selected.name : ($('n-name') && $('n-name').value ? $('n-name').value : '（尚未選擇）');
    return '將上傳至：<br><strong>Google Drive</strong> / ' +
      escapeHtml(settings.rootFolderName || '客戶資料') + ' / ' +
      '<strong>' + escapeHtml(name) + '</strong><br>各檔依「文件類型」進入對應分類資料夾';
  }

  function renderQueue(typeOpts) {
    typeOpts = typeOpts || '';
    if (!state.uploadQueue.length) return '<p class="empty" style="padding:1rem 0">尚未加入檔案</p>';
    return '<ul class="queue">' + state.uploadQueue.map(function (item, idx) {
      var opts = (DriveDocsStore.getSettings().categories || []).map(function (cat) {
        return '<option value="' + escapeHtml(cat) + '"' + (item.docType === cat ? ' selected' : '') + '>' + escapeHtml(cat) + '</option>';
      }).join('');
      return '<li class="queue__item" style="grid-template-columns:40px 1fr;align-items:start">' +
        '<div class="activity__ico">📄</div>' +
        '<div style="min-width:0">' +
          '<div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:start">' +
            '<div><p class="queue__name">' + escapeHtml(item.name) + '</p>' +
            '<p class="queue__meta">' + escapeHtml(formatSize(item.size)) + ' · ' + escapeHtml(item.status || '等待中') + '</p></div>' +
            '<button type="button" class="btn btn--sm btn--ghost btn-rm-q" data-idx="' + idx + '">移除</button>' +
          '</div>' +
          '<div class="field" style="margin:0.55rem 0 0"><label>文件類型</label>' +
            '<select class="doc-type" data-idx="' + idx + '">' + opts + '</select></div>' +
          '<div class="progress__bar" style="margin-top:0.45rem"><div class="progress__fill" style="width:' + (item.progress || 0) + '%"></div></div>' +
        '</div></li>';
    }).join('') + '</ul>';
  }

  function bindUpload(content, typeOpts) {
    content.querySelectorAll('.mode').forEach(function (btn) {
      btn.onclick = function () {
        state.uploadMode = btn.getAttribute('data-mode');
        if (state.uploadMode === 'new') state.uploadCustomerId = null;
        renderUpload(content);
      };
    });

    var cust = $('up-customer');
    if (cust) {
      cust.onchange = function () {
        state.uploadCustomerId = cust.value || null;
        renderUpload(content);
      };
    }

    var defType = $('up-default-type');
    if (defType) {
      defType.onchange = function () {
        state.uploadCategory = defType.value;
      };
    }

    var createBtn = $('btn-create-select');
    if (createBtn) {
      createBtn.onclick = function () {
        try {
          var row = DriveDocsStore.createCustomer({
            name: $('n-name').value.trim(),
            phone: $('n-phone').value.trim(),
            email: $('n-email').value.trim(),
            birthday: $('n-birthday').value,
            gender: $('n-gender').value,
            idNumber: $('n-id').value.trim(),
            address: $('n-address').value.trim()
          });
          state.uploadCustomerId = row.id;
          state.uploadMode = 'existing';
          toast('已建立「' + row.name + '」');
          renderUpload(content);
        } catch (err) { toast(err.message || err, true); }
      };
    }

    function refreshQueue() {
      $('queue-box').innerHTML = renderQueue(typeOpts);
      $('queue-box').querySelectorAll('.btn-rm-q').forEach(function (btn) {
        btn.onclick = function () {
          state.uploadQueue.splice(Number(btn.getAttribute('data-idx')), 1);
          refreshQueue();
        };
      });
      $('queue-box').querySelectorAll('.doc-type').forEach(function (sel) {
        sel.onchange = function () {
          var idx = Number(sel.getAttribute('data-idx'));
          state.uploadQueue[idx].docType = sel.value;
        };
      });
    }

    function addFiles(fileList) {
      var fallback = ($('up-default-type') && $('up-default-type').value) || state.uploadCategory;
      Array.prototype.forEach.call(fileList || [], function (file) {
        state.uploadQueue.push({
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          docType: fallback,
          progress: 0,
          status: '等待中'
        });
      });
      refreshQueue();
    }

    var dz = $('dropzone');
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('is-drag'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('is-drag'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('is-drag');
      addFiles(e.dataTransfer.files);
    });
    $('file-input').addEventListener('change', function (e) {
      addFiles(e.target.files);
      e.target.value = '';
    });

    $('btn-start-upload').onclick = function () {
      var btn = $('btn-start-upload');
      try {
        if (!state.uploadCustomerId) {
          // auto-create from form when in new mode or fields filled
          var name = $('n-name').value.trim();
          if (!name) { toast('請選擇客戶或填寫姓名', true); return; }
          var existing = DriveDocsStore.listCustomers('zhuyin').customers.find(function (c) { return c.name === name; });
          if (existing) {
            state.uploadCustomerId = existing.id;
          } else {
            var row = DriveDocsStore.createCustomer({
              name: name,
              phone: $('n-phone').value.trim(),
              email: $('n-email').value.trim(),
              birthday: $('n-birthday').value,
              gender: $('n-gender').value,
              idNumber: $('n-id').value.trim(),
              address: $('n-address').value.trim()
            });
            state.uploadCustomerId = row.id;
            toast('已建立客戶「' + row.name + '」');
          }
        }
      } catch (err) { toast(err.message || err, true); return; }

      if (!state.uploadQueue.length) { toast('請加入檔案（若只新建客戶可不傳檔）', true); 
        setPage('detail', { customerId: state.uploadCustomerId, tab: 'info' });
        return;
      }

      btn.disabled = true;
      var i = 0;
      function next() {
        if (i >= state.uploadQueue.length) {
          btn.disabled = false;
          toast('上傳完成（Demo）');
          var cid = state.uploadCustomerId;
          var lastType = state.uploadQueue.length ? state.uploadQueue[state.uploadQueue.length - 1].docType : null;
          state.uploadQueue = [];
          setPage('detail', { customerId: cid, tab: 'folders', openFolder: lastType });
          return;
        }
        var item = state.uploadQueue[i];
        item.status = '上傳中';
        item.progress = 35;
        refreshQueue();
        setTimeout(function () {
          try {
            item.progress = 80;
            refreshQueue();
            DriveDocsStore.uploadDocument({
              customerId: state.uploadCustomerId,
              category: item.docType || state.uploadCategory,
              fileName: item.name,
              mimeType: item.mimeType,
              size: item.size
            });
            item.progress = 100;
            item.status = '完成';
            refreshQueue();
            i += 1;
            setTimeout(next, 200);
          } catch (err) {
            item.status = '失敗';
            refreshQueue();
            toast(err.message || err, true);
            btn.disabled = false;
          }
        }, 250);
      }
      next();
    };
  }

  function renderEvents(content, kind) {
    var isLecture = kind === 'lecture';
    var title = isLecture ? '本週講座' : '本月活動';
    var period = isLecture ? DriveDocsStore.currentWeekLabel() : DriveDocsStore.currentMonthLabel();
    var items = isLecture ? DriveDocsStore.listLectures() : DriveDocsStore.listActivities();
    var current = items.filter(function (x) { return x.period === period; });
    var older = items.filter(function (x) { return x.period !== period; });

    content.innerHTML =
      '<section class="greeting"><h1>' + title + '</h1>' +
      '<p>期間：' + escapeHtml(period) + ' · 可上傳簡報、講義、海報等資料</p></section>' +
      '<section class="card" style="margin-bottom:1rem"><div class="card__hd"><div><h2 class="card__title">新增' + (isLecture ? '講座' : '活動') + '</h2></div></div>' +
      '<div class="card__bd">' +
        '<div class="field-row"><div class="field"><label>標題</label><input id="ev-title" placeholder="' + (isLecture ? '例：退休金規劃講座' : '例：客戶答謝午宴') + '"></div>' +
        '<div class="field"><label>期間</label><input id="ev-period" value="' + escapeHtml(period) + '"></div></div>' +
        '<div class="field"><label>備註</label><input id="ev-notes" placeholder="地點、講者、對象…"></div>' +
        '<div class="field"><label>上傳檔案</label><input type="file" id="ev-files" multiple accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.ppt,.pptx"></div>' +
        '<button type="button" class="btn btn--primary" id="btn-ev-create">建立並上傳</button>' +
      '</div></section>' +
      '<section class="card"><div class="card__hd"><div><h2 class="card__title">本期（' + escapeHtml(period) + '）</h2></div></div>' +
      '<div class="card__bd">' + renderEventList(current) + '</div></section>' +
      (older.length ? '<section class="card" style="margin-top:1rem"><div class="card__hd"><div><h2 class="card__title">歷史紀錄</h2></div></div><div class="card__bd">' + renderEventList(older) + '</div></section>' : '');

    $('btn-ev-create').onclick = function () {
      try {
        var filesInput = $('ev-files').files;
        var files = Array.prototype.map.call(filesInput || [], function (f) {
          return { id: Math.random().toString(16).slice(2), name: f.name, size: f.size, mimeType: f.type, createdAt: new Date().toISOString() };
        });
        var payload = {
          title: $('ev-title').value.trim(),
          period: $('ev-period').value.trim() || period,
          notes: $('ev-notes').value.trim(),
          files: files
        };
        if (isLecture) DriveDocsStore.createLecture(payload);
        else DriveDocsStore.createActivity(payload);
        toast('已建立');
        renderEvents(content, kind);
      } catch (err) { toast(err.message || err, true); }
    };
  }

  function renderEventList(items) {
    if (!items.length) return '<p class="empty">尚無資料</p>';
    return '<ul class="activity">' + items.map(function (ev) {
      var fileNames = (ev.files || []).map(function (f) { return f.name; }).join('、') || '尚無檔案';
      return '<li class="activity__item"><div class="activity__ico">📎</div><div>' +
        '<p class="activity__title">' + escapeHtml(ev.title) + '</p>' +
        '<p class="activity__desc">' + escapeHtml(ev.period) + (ev.notes ? ' · ' + escapeHtml(ev.notes) : '') + '<br>' + escapeHtml(fileNames) + '</p></div>' +
        '<div class="activity__time">' + escapeHtml(formatDate(ev.createdAt)) + '</div></li>';
    }).join('') + '</ul>';
  }

  /* —— Detail —— */
  function renderDetail(content) {
    var data = DriveDocsStore.getCustomer(state.customerId);
    var c = data.customer;
    var tab = state.detailTab || 'folders';

    content.innerHTML =
      '<div class="detail-head">' +
        '<div class="detail-head__folder"></div>' +
        '<div><h1>' + escapeHtml(c.name) + ' ' +
        (c.isRenewal || c.fileCount > 1 ? '<span class="badge badge--renewal">續保</span>' : '<span class="badge badge--new">新件</span>') +
        '</h1>' +
        '<p class="detail-head__meta">' + escapeHtml(c.phone || '無電話') +
        (c.gender ? ' · ' + escapeHtml(c.gender) : '') +
        (c.birthday ? ' · 生日 ' + escapeHtml(c.birthday) : '') +
        (c.idNumber ? ' · ' + escapeHtml(c.idNumber) : '') +
        (c.address ? ' · ' + escapeHtml(c.address) : '') +
        (c.email ? ' · ' + escapeHtml(c.email) : '') + '</p></div>' +
        '<div class="detail-head__right">' +
          '<div class="progress" style="min-width:160px"><div class="progress__bar"><div class="progress__fill' + (c.completion >= 100 ? ' is-done' : '') + '" data-width="' + c.completion + '"></div></div>' +
          '<span class="progress__pct">' + c.completion + '%</span></div>' +
          '<button type="button" class="btn" id="btn-edit-completion">編輯完成度</button>' +
          '<button type="button" class="btn btn--primary" id="btn-detail-upload">上傳</button>' +
        '</div>' +
      '</div>' +
      '<div class="tabs">' +
        tabBtn('folders', '資料夾總覽', tab) +
        tabBtn('info', '客戶資訊', tab) +
        tabBtn('notes', '備註', tab) +
        tabBtn('activity', '活動紀錄', tab) +
      '</div>' +
      '<div id="detail-body"></div>';

    $('btn-edit-completion').onclick = function () {
      state.detailTab = 'folders';
      toast('在資料夾卡片上切換「必填／已完成」即可更新完成度');
      renderDetail(content);
    };
    $('btn-detail-upload').onclick = function () {
      state.uploadCustomerId = c.id;
      state.uploadMode = 'existing';
      state.uploadCategory = state.openFolder || data.categories[0];
      setPage('upload');
    };
    content.querySelectorAll('.tab').forEach(function (btn) {
      btn.onclick = function () {
        state.detailTab = btn.getAttribute('data-tab');
        renderDetail(content);
      };
    });

    var body = $('detail-body');
    if (tab === 'folders') renderFolderTab(body, data);
    else if (tab === 'info') renderInfoTab(body, c);
    else if (tab === 'notes') renderNotesTab(body, c);
    else renderDetailActivity(body, c);
    animateBars(content);
  }

  function tabBtn(id, label, current) {
    return '<button type="button" class="tab' + (current === id ? ' is-active' : '') + '" data-tab="' + id + '">' + label + '</button>';
  }

  function renderFolderTab(body, data) {
    var c = data.customer;
    var meta = data.folderMeta || {};
    body.innerHTML =
      '<div class="folder-grid">' +
        data.categories.map(function (cat) {
          var m = meta[cat] || { required: false, done: false };
          var files = data.filesByCategory[cat] || [];
          var open = state.openFolder === cat;
          return '<div class="folder-card' + (open ? ' is-open' : '') + '" data-cat="' + escapeHtml(cat) + '">' +
            '<div class="folder-card__top"><span class="folder-ico"></span>' +
            (m.done ? '<span style="color:var(--green);font-weight:700">✔</span>' : '') + '</div>' +
            '<p class="folder-card__name">' + escapeHtml(cat) + '</p>' +
            '<p class="folder-card__meta">' + files.length + ' 個文件</p>' +
            '<div class="folder-card__flags">' +
              '<button type="button" class="flag' + (m.required ? ' is-on' : '') + '" data-act="required" data-cat="' + escapeHtml(cat) + '">' + (m.required ? '☑ 必填' : '☐ 非必填') + '</button>' +
              '<button type="button" class="flag' + (m.done ? ' is-done' : '') + '" data-act="done" data-cat="' + escapeHtml(cat) + '">' + (m.done ? '☑ 已完成' : '☐ 未完成') + '</button>' +
            '</div></div>';
        }).join('') +
      '</div>' +
      '<section class="card" id="folder-files"></section>';

    body.querySelectorAll('.folder-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.flag')) return;
        var cat = card.getAttribute('data-cat');
        state.openFolder = state.openFolder === cat ? null : cat;
        renderFolderTab(body, DriveDocsStore.getCustomer(c.id));
        animateBars(document);
      });
    });
    body.querySelectorAll('.flag').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var cat = btn.getAttribute('data-cat');
        var act = btn.getAttribute('data-act');
        var cur = (DriveDocsStore.getCustomer(c.id).folderMeta || {})[cat] || {};
        var patch = {};
        if (act === 'required') patch.required = !cur.required;
        if (act === 'done') patch.done = !cur.done;
        DriveDocsStore.updateFolderMeta(c.id, cat, patch);
        // re-render whole detail to refresh header progress
        render();
      };
    });

    renderOpenFolderFiles($('folder-files'), data);
  }

  function renderOpenFolderFiles(el, data) {
    if (!state.openFolder) {
      el.innerHTML = '<div class="card__bd"><p class="empty">點選上方資料夾以展開文件列表</p></div>';
      return;
    }
    var files = data.filesByCategory[state.openFolder] || [];
    el.innerHTML =
      '<div class="card__hd"><div><h2 class="card__title">' + escapeHtml(state.openFolder) + '</h2><p class="card__sub">File Table</p></div>' +
      '<button type="button" class="btn btn--primary btn--sm" id="btn-upload-folder">上傳到此資料夾</button></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th>檔名</th><th>類型</th><th>大小</th><th>上傳日期</th><th>操作</th>' +
      '</tr></thead><tbody>' +
      (files.length ? files.map(function (f) {
        var ext = (f.name.split('.').pop() || '').toUpperCase();
        return '<tr><td><div class="cell-name"><span class="activity__ico" style="width:28px;height:28px;border-radius:8px;font-size:0.75rem">📄</span>' + escapeHtml(f.name) + '</div></td>' +
          '<td>' + escapeHtml(ext) + '</td>' +
          '<td>' + escapeHtml(formatSize(f.size)) + '</td>' +
          '<td>' + escapeHtml(formatDate(f.createdAt || f.updatedAt)) + '</td>' +
          '<td><div style="display:flex;gap:0.35rem">' +
          '<button type="button" class="btn btn--sm btn--ghost btn-preview">預覽</button>' +
          '<button type="button" class="btn btn--sm btn--ghost btn-dl">下載</button>' +
          '<button type="button" class="btn btn--sm btn--danger btn-del-file" data-id="' + escapeHtml(f.id) + '" data-name="' + escapeHtml(f.name) + '">更多</button>' +
          '</div></td></tr>';
      }).join('') : '<tr><td colspan="5"><p class="empty">尚無文件</p></td></tr>') +
      '</tbody></table></div>';

    $('btn-upload-folder').onclick = function () {
      state.uploadCustomerId = data.customer.id;
      state.uploadCategory = state.openFolder;
      state.uploadMode = 'existing';
      setPage('upload');
    };
    el.querySelectorAll('.btn-preview, .btn-dl').forEach(function (btn) {
      btn.onclick = function () { toast('Demo：正式版會開啟 Google Drive'); };
    });
    el.querySelectorAll('.btn-del-file').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('刪除「' + btn.getAttribute('data-name') + '」？')) return;
        DriveDocsStore.deleteDocument({
          customerId: data.customer.id,
          fileId: btn.getAttribute('data-id'),
          fileName: btn.getAttribute('data-name')
        });
        toast('已刪除');
        render();
      };
    });
  }

  function renderInfoTab(body, c) {
    body.innerHTML =
      '<section class="card"><div class="card__bd">' +
        '<div class="field-row"><div class="field"><label>姓名</label><input id="c-name" value="' + escapeHtml(c.name) + '"></div>' +
        '<div class="field"><label>電話</label><input id="c-phone" value="' + escapeHtml(c.phone) + '"></div></div>' +
        '<div class="field-row"><div class="field"><label>Email</label><input id="c-email" value="' + escapeHtml(c.email || '') + '"></div>' +
        '<div class="field"><label>生日</label><input id="c-birthday" type="date" value="' + escapeHtml(c.birthday || '') + '"></div></div>' +
        '<div class="field-row"><div class="field"><label>性別</label><select id="c-gender">' +
          '<option value="">請選擇</option>' +
          '<option value="男"' + (c.gender === '男' ? ' selected' : '') + '>男</option>' +
          '<option value="女"' + (c.gender === '女' ? ' selected' : '') + '>女</option>' +
          '<option value="其他"' + (c.gender === '其他' ? ' selected' : '') + '>其他</option>' +
        '</select></div>' +
        '<div class="field"><label>身分證號</label><input id="c-id" value="' + escapeHtml(c.idNumber || '') + '" placeholder="A123456789"></div></div>' +
        '<div class="field"><label>地址</label><input id="c-address" value="' + escapeHtml(c.address || '') + '" placeholder="縣市／區／路街門牌"></div>' +
        '<div class="field"><label>標籤</label><input id="c-tags" value="' + escapeHtml((c.tags || []).join(', ')) + '"></div>' +
        '<p class="upload-hint">文件筆數：<strong>' + (c.fileCount || 0) + '</strong> · 狀態：' +
          (c.isRenewal || c.fileCount > 1 ? '<span class="badge badge--renewal">續保</span>（資料大於 1 筆）' : '<span class="badge badge--new">新件</span>') +
        '</p>' +
        '<button type="button" class="btn btn--primary" id="btn-save-info">儲存</button>' +
      '</div></section>';
    $('btn-save-info').onclick = function () {
      DriveDocsStore.updateCustomer(c.id, {
        name: $('c-name').value,
        phone: $('c-phone').value,
        email: $('c-email').value,
        birthday: $('c-birthday').value,
        gender: $('c-gender').value,
        idNumber: $('c-id').value.trim(),
        address: $('c-address').value.trim(),
        tags: $('c-tags').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean)
      });
      toast('已儲存');
      render();
    };
  }

  function renderNotesTab(body, c) {
    body.innerHTML =
      '<section class="card"><div class="card__bd">' +
        '<div class="field"><label>備註</label><textarea id="c-notes">' + escapeHtml(c.notes || '') + '</textarea></div>' +
        '<button type="button" class="btn btn--primary" id="btn-save-notes">儲存備註</button>' +
      '</div></section>';
    $('btn-save-notes').onclick = function () {
      DriveDocsStore.updateCustomer(c.id, { notes: $('c-notes').value });
      toast('已儲存');
    };
  }

  function renderDetailActivity(body, c) {
    var all = DriveDocsStore.getDashboard().activity.filter(function (a) { return a.customerId === c.id; });
    body.innerHTML = '<section class="card"><div class="card__bd">' + renderActivity(all) + '</div></section>';
  }

  /* —— Reports / Settings / Search —— */
  function renderReports(content) {
    var r = DriveDocsStore.getReports();
    var d = DriveDocsStore.getDashboard();
    content.innerHTML =
      '<section class="greeting"><h1>' + (state.page === 'analytics' ? '報表分析' : '每月回報') + '</h1>' +
      '<p>本月 ' + escapeHtml(r.month) + ' · 聚焦進度與活動</p></section>' +
      '<div class="overview" style="grid-template-columns:repeat(4,minmax(0,1fr))">' +
        statCard('＋', r.monthStats.newCustomers, '本月新增客戶') +
        statCard('↑', r.monthStats.organized, '本月整理') +
        statCard('%', r.completionRate + '%', '完成率') +
        statCard('📄', d.totalFiles, '文件總計') +
      '</div>' +
      '<div class="overview" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0">' +
        statCard('🎙', r.lecturesThisWeek, '本週講座') +
        statCard('📅', r.activitiesThisMonth, '本月活動') +
      '</div>' +
      '<section class="card"><div class="card__hd"><div><h2 class="card__title">Recent Update</h2></div></div>' +
      '<div class="card__bd">' + renderActivity(d.activity) + '</div></section>' +
      '<section class="card" style="margin-top:1rem"><div class="card__hd"><div><h2 class="card__title">近 12 個月</h2></div></div>' +
      '<div class="card__bd"><ul class="activity">' +
        (r.history.length ? r.history.map(function (h) {
          return '<li class="activity__item"><div class="activity__ico">▣</div><div>' +
            '<p class="activity__title">' + escapeHtml(h.month) + '</p>' +
            '<p class="activity__desc">新增 ' + h.newCustomers + ' · 整理 ' + h.organized + '</p></div></li>';
        }).join('') : '<p class="empty">尚無資料</p>') +
      '</ul></div></section>';
    content.querySelectorAll('.activity__item[data-id]').forEach(function (el) {
      el.onclick = function () {
        if (el.getAttribute('data-id')) setPage('detail', { customerId: el.getAttribute('data-id') });
      };
    });
  }

  function renderSettings(content) {
    var s = DriveDocsStore.getSettings();
    content.innerHTML =
      '<section class="greeting"><h1>設定</h1><p>僅調整資料夾模板與 Drive 根目錄命名 · 無個人簡介設定</p></section>' +
      '<div class="stack">' +
        '<section class="card"><div class="card__bd">' +
          '<div class="field"><label>根目錄名稱</label><input id="s-root" value="' + escapeHtml(s.rootFolderName) + '"></div>' +
          '<div class="field"><label>命名規則</label><input id="s-naming" value="' + escapeHtml(s.namingRule) + '"></div>' +
          '<button type="button" class="btn btn--primary" id="btn-save-settings">儲存</button>' +
        '</div></section>' +
        '<section class="card"><div class="card__hd"><div><h2 class="card__title">資料夾模板</h2><p class="card__sub">新客戶預設分類</p></div></div><div class="card__bd">' +
          '<div id="cat-editor">' + s.categories.map(function (cat) {
            return '<div class="field" style="display:grid;grid-template-columns:1fr auto;gap:0.5rem;align-items:end">' +
              '<div><label>分類</label><input value="' + escapeHtml(cat) + '"></div>' +
              '<button type="button" class="btn btn--ghost btn-rm">移除</button></div>';
          }).join('') + '</div>' +
          '<div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap">' +
            '<button type="button" class="btn" id="btn-add-cat">新增分類</button>' +
            '<button type="button" class="btn btn--primary" id="btn-save-cats">儲存模板</button>' +
            '<button type="button" class="btn" id="btn-reset">清除本機資料</button>' +
          '</div></div></section></div>';

    $('btn-add-cat').onclick = function () {
      var wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:0.5rem;align-items:end';
      wrap.innerHTML = '<div><label>分類</label><input value=""></div><button type="button" class="btn btn--ghost btn-rm">移除</button>';
      $('cat-editor').appendChild(wrap);
      wrap.querySelector('.btn-rm').onclick = function () { wrap.remove(); };
    };
    content.querySelectorAll('.btn-rm').forEach(function (btn) {
      btn.onclick = function () { btn.parentElement.remove(); };
    });
    $('btn-save-settings').onclick = function () {
      DriveDocsStore.saveSettings({ rootFolderName: $('s-root').value, namingRule: $('s-naming').value });
      toast('已儲存');
      renderRail();
    };
    $('btn-save-cats').onclick = function () {
      var cats = Array.prototype.map.call($('cat-editor').querySelectorAll('input'), function (i) { return i.value.trim(); }).filter(Boolean);
      DriveDocsStore.saveSettings({ categories: cats });
      toast('模板已更新');
      render();
    };
    $('btn-reset').onclick = function () {
      DriveDocsStore.resetDemo();
      toast('已清除並重建本機資料');
      setPage('dashboard');
    };
  }

  function renderSearch(content) {
    var res = DriveDocsStore.search(state.searchQuery || '');
    content.innerHTML =
      '<section class="greeting"><h1>搜尋結果</h1><p>' + escapeHtml(state.searchQuery) + '</p></section>' +
      '<div class="stack">' +
        '<section class="card"><div class="card__hd"><div><h2 class="card__title">客戶（' + res.customers.length + '）</h2></div></div>' +
        '<div class="card__bd table-wrap"><table class="table"><tbody>' +
          res.customers.map(customerRow).join('') +
        '</tbody></table></div></section>' +
        '<section class="card"><div class="card__hd"><div><h2 class="card__title">文件（' + res.files.length + '）</h2></div></div>' +
        '<div class="card__bd"><ul class="activity">' +
          res.files.map(function (x) {
            return '<li class="activity__item" data-id="' + escapeHtml(x.customerId) + '">' +
              '<div class="activity__ico">📄</div><div><p class="activity__title">' + escapeHtml(x.file.name) + '</p>' +
              '<p class="activity__desc">' + escapeHtml(x.customerName) + ' · ' + escapeHtml(x.file.category) + '</p></div></li>';
          }).join('') +
        '</ul></div></section></div>';
    bindCustomerList(content, { customers: res.customers, initials: [] });
  }

  function showCreateCustomerModal() {
    openModal(
      '<h2>新增客戶</h2>' +
      '<div class="field"><label>姓名</label><input id="m-name" placeholder="王大明"></div>' +
      '<div class="field"><label>電話</label><input id="m-phone" placeholder="0912-123-456"></div>' +
      '<div class="field"><label>Email</label><input id="m-email"></div>' +
      '<div class="field"><label>生日</label><input id="m-birthday" type="date"></div>' +
      '<div class="field"><label>性別</label><select id="m-gender"><option value="">請選擇</option><option value="男">男</option><option value="女">女</option><option value="其他">其他</option></select></div>' +
      '<div class="field"><label>身分證號</label><input id="m-id" placeholder="A123456789"></div>' +
      '<div class="field"><label>地址</label><input id="m-address" placeholder="縣市／區／路街門牌"></div>' +
      '<div class="modal__actions">' +
        '<button type="button" class="btn" id="m-cancel">取消</button>' +
        '<button type="button" class="btn btn--primary" id="m-ok">建立</button></div>'
    );
    $('m-cancel').onclick = closeModal;
    $('m-ok').onclick = function () {
      try {
        var c = DriveDocsStore.createCustomer({
          name: $('m-name').value.trim(),
          phone: $('m-phone').value.trim(),
          email: $('m-email').value.trim(),
          birthday: $('m-birthday').value,
          gender: $('m-gender').value,
          idNumber: $('m-id').value.trim(),
          address: $('m-address').value.trim()
        });
        closeModal();
        toast('已建立「' + c.name + '」');
        setPage('detail', { customerId: c.id, tab: 'folders' });
      } catch (err) { toast(err.message || err, true); }
    };
  }

  function openModal(html) {
    var root = $('modal-root');
    root.innerHTML = '<div class="modal-backdrop" id="modal-backdrop"><div class="modal">' + html + '</div></div>';
    $('modal-backdrop').addEventListener('click', function (e) {
      if (e.target.id === 'modal-backdrop') root.innerHTML = '';
    });
  }
  function closeModal() { $('modal-root').innerHTML = ''; }

  function boot() {
    document.querySelectorAll('.menu__item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPage(btn.getAttribute('data-page'));
      });
    });
    $('sidebar-toggle').addEventListener('click', function () {
      $('sidebar').classList.toggle('is-open');
    });
    var timer;
    $('global-search').addEventListener('input', function () {
      clearTimeout(timer);
      var q = $('global-search').value.trim();
      timer = setTimeout(function () {
        if (!q) {
          if (state.page === 'search') setPage('dashboard');
          return;
        }
        state.searchQuery = q;
        setPage('search');
      }, 250);
    });
    // force v2 seed if empty
    DriveDocsStore.listCustomers('zhuyin');
    setPage('dashboard');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
