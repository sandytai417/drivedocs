(function () {
  'use strict';

  var state = {
    page: 'dashboard',
    sortBy: 'zhuyin',
    customerId: null,
    activeCategory: null,
    searchTimer: null,
    searchQuery: '',
    uploadPreset: null,
    uploadQueue: []
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
    return s.length >= 16 ? s.slice(0, 16).replace('T', ' ').replace(/-/g, '/') : s.slice(0, 10).replace(/-/g, '/');
  }

  function formatSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function extClass(name) {
    var ext = String(name).split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].indexOf(ext) >= 0) return 'is-img';
    if (['doc', 'docx', 'xls', 'xlsx'].indexOf(ext) >= 0) return 'is-doc';
    return '';
  }

  function extLabel(name) {
    return String(name).split('.').pop().toUpperCase().slice(0, 4) || 'FILE';
  }

  function animateBars(root) {
    requestAnimationFrame(function () {
      (root || document).querySelectorAll('[data-width]').forEach(function (el) {
        el.style.width = el.getAttribute('data-width') + '%';
      });
    });
  }

  function closeSidebar() {
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
    if (opts.category !== undefined) state.activeCategory = opts.category;
    document.querySelectorAll('.sider__item').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-page') === page);
    });
    closeSidebar();
    render();
  }

  function render() {
    var content = $('content');
    try {
      if (state.page === 'dashboard') renderDashboard(content);
      else if (state.page === 'customers') renderCustomers(content);
      else if (state.page === 'detail') renderDetail(content);
      else if (state.page === 'upload') renderUpload(content);
      else if (state.page === 'reports') renderReports(content);
      else if (state.page === 'settings') renderSettings(content);
      else if (state.page === 'search') renderSearch(content);
      animateBars(content);
    } catch (err) {
      content.innerHTML = '<div class="card card__bd"><p>' + escapeHtml(err.message || err) + '</p></div>';
      toast(err.message || String(err), true);
    }
  }

  function renderDashboard(content) {
    var d = DriveDocsStore.getDashboard();
    var recent = DriveDocsStore.listCustomers('updated').customers.slice(0, 6);

    content.innerHTML =
      '<section class="card welcome">' +
        '<div class="welcome__avatar">S</div>' +
        '<div><p class="welcome__hi">你好，示範使用者！</p>' +
        '<p class="welcome__lead">今天也把客戶文件整理得更清楚一點。Google Drive is the database — DriveDocs is the interface.</p></div>' +
        '<div class="welcome__brand">DriveDocs</div>' +
      '</section>' +

      '<div class="kpi-grid">' +
        kpi('總客戶數', d.totalCustomers, '資料夾', '📁') +
        kpi('今日新增', d.todayNew, '新客戶', '＋') +
        kpi('今日整理', d.todayOrganized, '上傳次數', '↑') +
        kpi('待整理', d.pending, '未滿 100%', '…') +
        kpi('完成率', d.completionRate + '%', '全體平均', '✔') +
      '</div>' +

      '<div class="work-grid">' +
        '<section class="card">' +
          '<div class="card__hd"><h2 class="card__title">進行中的客戶資料夾</h2>' +
          '<button type="button" class="btn btn--primary" id="btn-new-customer">新建客戶</button></div>' +
          '<div class="card__bd"><div class="project-grid" id="project-grid">' +
            (recent.length ? recent.map(projectCard).join('') : '<p class="empty">尚無客戶</p>') +
          '</div></div>' +
        '</section>' +
        '<div style="display:grid;gap:0.85rem">' +
          '<section class="card">' +
            '<div class="card__hd"><h2 class="card__title">快捷操作</h2></div>' +
            '<div class="card__bd"><div class="quick">' +
              '<button type="button" data-go="customers">客戶資料夾</button>' +
              '<button type="button" data-go="upload">文件上傳</button>' +
              '<button type="button" data-go="reports">每日報表</button>' +
              '<button type="button" id="btn-quick-new">新增客戶</button>' +
            '</div></div>' +
          '</section>' +
          '<section class="card">' +
            '<div class="card__hd"><h2 class="card__title">動態</h2></div>' +
            '<div class="card__bd">' + renderActivity(d.activity || []) + '</div>' +
          '</section>' +
        '</div>' +
      '</div>' +

      '<section class="card">' +
        '<div class="card__hd"><h2 class="card__title">整理進度</h2></div>' +
        '<div class="card__bd" style="padding:0;overflow:auto">' +
          '<table class="file-table"><thead><tr><th>客戶</th><th>電話</th><th>更新日期</th><th>完成度</th></tr></thead><tbody>' +
          DriveDocsStore.listCustomers('completion').customers.slice(0, 8).map(function (c) {
            return '<tr style="cursor:pointer" data-id="' + escapeHtml(c.id) + '" data-name="' + escapeHtml(c.name) + '">' +
              '<td><strong>' + escapeHtml(c.name) + '</strong></td>' +
              '<td>' + escapeHtml(c.phone || '—') + '</td>' +
              '<td>' + escapeHtml(formatDate(c.updatedAt)) + '</td>' +
              '<td style="min-width:140px"><div class="completion__bar"><div class="completion__fill" data-width="' + c.completion + '"></div></div>' +
              '<div class="completion__pct">' + c.completion + '%</div></td></tr>';
          }).join('') +
          '</tbody></table></div></section>';

    $('btn-new-customer').onclick = showCreateCustomerModal;
    $('btn-quick-new').onclick = showCreateCustomerModal;
    content.querySelectorAll('[data-go]').forEach(function (btn) {
      btn.onclick = function () { setPage(btn.getAttribute('data-go')); };
    });
    content.querySelectorAll('#project-grid .project, tbody tr[data-id], [data-customer-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id') || el.getAttribute('data-customer-id');
        var name = el.getAttribute('data-name');
        if (id) setPage('detail', { customerId: id, title: name, category: null });
      });
    });
  }

  function kpi(label, value, hint, icon) {
    return '<article class="card kpi"><div class="kpi__icon">' + icon + '</div>' +
      '<p class="kpi__label">' + escapeHtml(label) + '</p>' +
      '<p class="kpi__value">' + escapeHtml(String(value)) + '</p>' +
      '<p class="kpi__hint">' + escapeHtml(hint) + '</p></article>';
  }

  function projectCard(c) {
    return '<button type="button" class="project" data-id="' + escapeHtml(c.id) + '" data-name="' + escapeHtml(c.name) + '">' +
      '<div class="project__top"><span class="project__folder"></span><div>' +
      '<p class="project__name">' + escapeHtml(c.name) + '</p>' +
      '<p class="project__meta">' + escapeHtml(c.phone || '無電話') + ' · ' + escapeHtml(formatDate(c.updatedAt)) + '</p></div></div>' +
      '<div class="project__bar"><div class="project__fill" data-width="' + (c.completion || 0) + '"></div></div>' +
      '</button>';
  }

  function renderActivity(items) {
    if (!items.length) return '<p class="empty">尚無動態</p>';
    return '<ul class="activity">' + items.slice(0, 8).map(function (a) {
      return '<li class="activity__item" data-customer-id="' + escapeHtml(a.customerId) + '" data-name="' + escapeHtml(a.customerName) + '" style="cursor:pointer">' +
        '<span class="activity__dot">' + escapeHtml((a.customerName || '?').charAt(0)) + '</span>' +
        '<div><p class="activity__name">' + escapeHtml(a.customerName || '—') + '</p>' +
        '<p class="activity__detail">' + escapeHtml(a.detail) + '</p></div>' +
        '<span class="activity__time">' + escapeHtml(a.time || '') + '</span></li>';
    }).join('') + '</ul>';
  }

  function renderCustomers(content) {
    var data = DriveDocsStore.listCustomers(state.sortBy);
    var sort = data.sortBy;

    content.innerHTML =
      '<div class="breadcrumb"><button type="button" id="bc-root">客戶資料</button><span>/</span><strong>全部客戶</strong></div>' +
      '<div class="toolbar">' +
        '<button type="button" class="btn btn--primary" id="btn-new-customer">新建資料夾</button>' +
        '<button type="button" class="btn" id="btn-go-upload">上傳</button>' +
        '<div class="seg" id="sort-seg">' +
          segBtn('zhuyin', '注音', sort) +
          segBtn('updated', '最近更新', sort) +
          segBtn('created', '建立日期', sort) +
          segBtn('completion', '完成度', sort) +
        '</div>' +
        '<span style="color:var(--muted);font-size:0.86rem;margin-left:auto">共 ' + data.customers.length + ' 個資料夾</span>' +
      '</div>' +
      '<section class="card"><div class="card__bd" style="padding:0.75rem">' +
        (data.customers.length
          ? (sort === 'zhuyin' && data.groups
              ? data.groups.map(function (g) {
                  return '<div class="zhuyin-group"><div class="zhuyin-group__head"><span>' + escapeHtml(g.initial) + '</span><span class="zhuyin-group__rule"></span></div>' +
                    '<div class="folder-strip">' + g.customers.map(folderTile).join('') + '</div></div>';
                }).join('')
              : '<div class="folder-strip">' + data.customers.map(folderTile).join('') + '</div>')
          : '<p class="empty">尚無客戶資料夾</p>') +
      '</div></section>';

    $('btn-new-customer').onclick = showCreateCustomerModal;
    $('btn-go-upload').onclick = function () { setPage('upload'); };
    $('bc-root').onclick = function () { setPage('customers'); };
    $('sort-seg').onclick = function (e) {
      var btn = e.target.closest('button[data-sort]');
      if (!btn) return;
      state.sortBy = btn.getAttribute('data-sort');
      renderCustomers(content);
      animateBars(content);
    };
    content.querySelectorAll('.folder-tile').forEach(function (tile) {
      tile.onclick = function () {
        setPage('detail', { customerId: tile.getAttribute('data-id'), category: null });
      };
    });
  }

  function folderTile(c) {
    return '<button type="button" class="folder-tile" data-id="' + escapeHtml(c.id) + '">' +
      '<div class="folder-tile__ico"></div>' +
      '<p class="folder-tile__name">' + escapeHtml(c.name) + '</p>' +
      '<p class="folder-tile__meta">' + (c.completion || 0) + '% · ' + escapeHtml(formatDate(c.updatedAt).slice(0, 10)) + '</p>' +
      '</button>';
  }

  function segBtn(value, label, current) {
    return '<button type="button" data-sort="' + value + '" class="' + (current === value ? 'is-active' : '') + '">' + label + '</button>';
  }

  function renderDetail(content) {
    var data = DriveDocsStore.getCustomer(state.customerId);
    var c = data.customer;
    var cats = data.categories || [];
    var active = state.activeCategory;
    if (active && cats.indexOf(active) === -1) active = null;

    var files = [];
    if (active) {
      files = (data.filesByCategory[active] || []).slice();
    } else {
      cats.forEach(function (cat) {
        (data.filesByCategory[cat] || []).forEach(function (f) {
          files.push(Object.assign({}, f, { category: f.category || cat }));
        });
      });
    }

    var checklist = (data.completion.checklist || []).map(function (item) {
      return '<div class="checklist__item"><span class="' + (item.done ? 'ok' : 'no') + '">' +
        (item.done ? '✔' : '✘') + '</span><span>' + escapeHtml(item.category) + '（' + item.count + '）</span></div>';
    }).join('');

    content.innerHTML =
      '<div class="breadcrumb">' +
        '<button type="button" id="bc-root">客戶資料</button><span>/</span>' +
        '<button type="button" id="bc-customer">' + escapeHtml(c.name) + '</button>' +
        (active ? '<span>/</span><strong>' + escapeHtml(active) + '</strong>' : '<span>/</span><strong>全部文件</strong>') +
      '</div>' +

      '<div class="detail-grid">' +
        '<aside class="card">' +
          '<div class="card__hd"><h2 class="card__title">客戶資料</h2></div>' +
          '<div class="card__bd">' +
            '<div class="field"><label>姓名</label><input id="c-name" value="' + escapeHtml(c.name) + '"></div>' +
            '<div class="field"><label>電話</label><input id="c-phone" value="' + escapeHtml(c.phone) + '"></div>' +
            '<div class="field"><label>Email</label><input id="c-email" value="' + escapeHtml(c.email) + '"></div>' +
            '<div class="field"><label>標籤</label><input id="c-tags" value="' + escapeHtml((c.tags || []).join(', ')) + '"></div>' +
            '<div class="field"><label>備註</label><textarea id="c-notes">' + escapeHtml(c.notes) + '</textarea></div>' +
            '<div class="completion" style="text-align:left;min-width:0;margin-bottom:0.5rem">' +
              '<div class="completion__bar"><div class="completion__fill" data-width="' + data.completion.percent + '"></div></div>' +
              '<div class="completion__pct">完成度 ' + data.completion.percent + '%</div></div>' +
            '<div class="checklist">' + checklist + '</div>' +
            '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.85rem">' +
              '<button type="button" class="btn btn--primary" id="btn-save">儲存</button>' +
              '<button type="button" class="btn btn--danger" id="btn-del">刪除</button>' +
            '</div>' +
          '</div>' +
        '</aside>' +

        '<div>' +
          '<div class="toolbar">' +
            '<button type="button" class="btn btn--primary" id="btn-upload-here">上傳</button>' +
            '<button type="button" class="btn" id="btn-show-all">全部文件</button>' +
          '</div>' +
          '<section class="card" style="margin-bottom:0.85rem">' +
            '<div class="card__hd"><h2 class="card__title">分類資料夾</h2></div>' +
            '<div class="card__bd"><div class="folder-strip">' +
              cats.map(function (cat) {
                var count = (data.filesByCategory[cat] || []).length;
                return '<button type="button" class="folder-tile' + (active === cat ? ' is-active' : '') + '" data-cat="' + escapeHtml(cat) + '">' +
                  '<div class="folder-tile__ico"></div>' +
                  '<p class="folder-tile__name">' + escapeHtml(cat) + '</p>' +
                  '<p class="folder-tile__meta">' + count + ' 個檔案</p></button>';
              }).join('') +
            '</div></div>' +
          '</section>' +
          '<section class="card">' +
            '<div class="card__hd"><h2 class="card__title">' + (active ? escapeHtml(active) : '文件列表') + '</h2>' +
            '<span style="color:var(--muted);font-size:0.84rem">' + files.length + ' 個檔案</span></div>' +
            '<div class="card__bd" style="padding:0;overflow:auto">' +
              (files.length
                ? '<table class="file-table"><thead><tr><th>檔名</th><th>大小</th><th>分類</th><th>修改時間</th><th></th></tr></thead><tbody>' +
                  files.map(function (f) {
                    return '<tr><td><div class="file-name"><span class="file-ext ' + extClass(f.name) + '">' + escapeHtml(extLabel(f.name)) + '</span>' +
                      escapeHtml(f.name) + '</div></td>' +
                      '<td>' + escapeHtml(formatSize(f.size)) + '</td>' +
                      '<td>' + escapeHtml(f.category || active || '—') + '</td>' +
                      '<td>' + escapeHtml(formatDate(f.updatedAt)) + '</td>' +
                      '<td><div class="file-actions">' +
                      '<button type="button" class="btn btn--ghost btn-preview">預覽</button>' +
                      '<button type="button" class="btn btn--danger btn-del-file" data-file-id="' + escapeHtml(f.id) + '" data-file-name="' + escapeHtml(f.name) + '">刪除</button>' +
                      '</div></td></tr>';
                  }).join('') + '</tbody></table>'
                : '<p class="empty">此資料夾尚無文件，點「上傳」開始整理</p>') +
            '</div>' +
          '</section>' +
        '</div>' +
      '</div>';

    $('bc-root').onclick = function () { setPage('customers'); };
    $('bc-customer').onclick = function () { setPage('detail', { customerId: c.id, category: null }); };
    $('btn-show-all').onclick = function () { setPage('detail', { customerId: c.id, category: null }); };
    $('btn-upload-here').onclick = function () {
      state.uploadPreset = { customerId: c.id, category: active || cats[0] };
      setPage('upload');
    };
    content.querySelectorAll('.folder-tile[data-cat]').forEach(function (tile) {
      tile.onclick = function () {
        setPage('detail', { customerId: c.id, category: tile.getAttribute('data-cat') });
      };
    });
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
        renderDetail(content);
        animateBars(content);
      } catch (err) { toast(err.message || err, true); }
    };
    $('btn-del').onclick = function () {
      if (!confirm('確定刪除客戶「' + c.name + '」？')) return;
      DriveDocsStore.deleteCustomer(c.id);
      toast('已刪除');
      setPage('customers');
    };
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
        renderDetail(content);
        animateBars(content);
      };
    });
  }

  function renderUpload(content) {
    var customers = DriveDocsStore.listCustomers('zhuyin').customers;
    var settings = DriveDocsStore.getSettings();
    var options = customers.map(function (c) {
      var sel = state.uploadPreset && state.uploadPreset.customerId === c.id ? ' selected' : '';
      return '<option value="' + escapeHtml(c.id) + '"' + sel + '>' + escapeHtml(c.name) + '</option>';
    }).join('');
    var catOpts = (settings.categories || []).map(function (cat) {
      var sel = state.uploadPreset && state.uploadPreset.category === cat ? ' selected' : '';
      return '<option value="' + escapeHtml(cat) + '"' + sel + '>' + escapeHtml(cat) + '</option>';
    }).join('');

    content.innerHTML =
      '<div class="breadcrumb"><strong>文件上傳</strong></div>' +
      '<div class="upload-layout">' +
        '<section class="card">' +
          '<div class="card__hd"><h2 class="card__title">選擇檔案</h2></div>' +
          '<div class="card__bd">' +
            '<div class="dropzone" id="dropzone">' +
              '<p class="dropzone__title">拖曳檔案到這裡</p>' +
              '<p class="dropzone__hint">支援 PDF / JPG / PNG / DOCX / XLSX</p>' +
              '<p style="margin-top:1rem"><label class="btn btn--primary">選擇檔案<input type="file" id="file-input" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"></label></p>' +
            '</div>' +
            '<div style="margin-top:1rem">' +
              '<div class="field"><label>上傳到客戶資料夾</label><select id="up-customer"><option value="">請選擇</option>' + options + '</select></div>' +
              '<div class="field"><label>分類資料夾</label><select id="up-category">' + catOpts + '</select></div>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="card">' +
          '<div class="card__hd"><h2 class="card__title">上傳佇列</h2>' +
          '<button type="button" class="btn btn--primary" id="btn-start-upload">開始上傳</button></div>' +
          '<div class="card__bd" id="queue-box">' + renderQueue() + '</div>' +
        '</section>' +
      '</div>';

    bindUploadHandlers(content);
  }

  function renderQueue() {
    if (!state.uploadQueue.length) {
      return '<p class="empty">尚未加入檔案<br>拖曳或選擇後會顯示在這裡</p>';
    }
    return '<ul class="queue">' + state.uploadQueue.map(function (item, idx) {
      return '<li class="queue__item" data-idx="' + idx + '">' +
        '<div><p class="queue__name">' + escapeHtml(item.name) + '</p>' +
        '<p class="queue__meta">' + escapeHtml(formatSize(item.size)) + '</p>' +
        '<div class="progress"><span style="width:' + (item.progress || 0) + '%"></span></div></div>' +
        '<div style="text-align:right">' +
          '<div class="queue__status">' + escapeHtml(item.status || '等待中') + '</div>' +
          '<button type="button" class="btn btn--ghost btn-rm-q" data-idx="' + idx + '" style="margin-top:0.35rem">移除</button>' +
        '</div></li>';
    }).join('') + '</ul>';
  }

  function bindUploadHandlers(content) {
    function refreshQueue() {
      $('queue-box').innerHTML = renderQueue();
      $('queue-box').querySelectorAll('.btn-rm-q').forEach(function (btn) {
        btn.onclick = function () {
          state.uploadQueue.splice(Number(btn.getAttribute('data-idx')), 1);
          refreshQueue();
        };
      });
    }

    function addFiles(fileList) {
      Array.prototype.forEach.call(fileList || [], function (file) {
        state.uploadQueue.push({
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          file: file,
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
      var customerId = $('up-customer').value;
      var category = $('up-category').value;
      if (!customerId) { toast('請選擇客戶資料夾', true); return; }
      if (!state.uploadQueue.length) { toast('請先加入檔案', true); return; }

      var btn = $('btn-start-upload');
      btn.disabled = true;
      var i = 0;

      function next() {
        if (i >= state.uploadQueue.length) {
          btn.disabled = false;
          toast('上傳完成（Demo）');
          state.uploadPreset = null;
          setTimeout(function () {
            state.uploadQueue = [];
            setPage('detail', { customerId: customerId, category: category });
          }, 500);
          return;
        }
        var item = state.uploadQueue[i];
        item.status = '上傳中';
        item.progress = 30;
        refreshQueue();

        setTimeout(function () {
          try {
            item.progress = 70;
            refreshQueue();
            DriveDocsStore.uploadDocument({
              customerId: customerId,
              category: category,
              fileName: item.name,
              mimeType: item.mimeType,
              size: item.size
            });
            item.progress = 100;
            item.status = '完成';
            refreshQueue();
            i += 1;
            setTimeout(next, 220);
          } catch (err) {
            item.status = '失敗';
            refreshQueue();
            toast(err.message || err, true);
            btn.disabled = false;
          }
        }, 280);
      }
      next();
    };

    refreshQueue();
  }

  function renderReports(content) {
    var r = DriveDocsStore.getReports();
    content.innerHTML =
      '<div class="stat-grid">' +
        kpi('今日新增', r.today.newCustomers, '客戶', '＋') +
        kpi('整理完成', r.today.organized, '上傳', '↑') +
        kpi('缺少文件', r.today.missingDocs, '缺件客戶', '!') +
        kpi('總完成率', r.completionRate + '%', '平均', '✔') +
      '</div>' +
      '<div class="split-2">' +
        '<section class="card"><div class="card__hd"><h2 class="card__title">文件缺漏</h2></div><div class="card__bd">' +
          (r.missing.length
            ? '<ul class="activity">' + r.missing.map(function (m) {
                return '<li class="activity__item" data-id="' + escapeHtml(m.customerId) + '" data-name="' + escapeHtml(m.customerName) + '" style="cursor:pointer">' +
                  '<span class="activity__dot">' + escapeHtml(m.customerName.charAt(0)) + '</span>' +
                  '<div><p class="activity__name">' + escapeHtml(m.customerName) + '</p>' +
                  '<p class="activity__detail">' + escapeHtml((m.missingCategories || []).join('、')) + '</p></div>' +
                  '<span class="activity__time">' + m.completion + '%</span></li>';
              }).join('') + '</ul>'
            : '<p class="empty">沒有缺件</p>') +
        '</div></section>' +
        '<section class="card"><div class="card__hd"><h2 class="card__title">近 14 日</h2></div><div class="card__bd">' +
          (r.history.length
            ? '<ul class="activity">' + r.history.map(function (h) {
                return '<li class="activity__item"><span class="activity__dot">·</span><div>' +
                  '<p class="activity__name">' + escapeHtml(h.date) + '</p>' +
                  '<p class="activity__detail">新增 ' + h.newCustomers + ' · 整理 ' + h.organized + '</p></div></li>';
              }).join('') + '</ul>'
            : '<p class="empty">尚無資料</p>') +
        '</div></section></div>';
    content.querySelectorAll('[data-id]').forEach(function (el) {
      el.onclick = function () {
        setPage('detail', { customerId: el.getAttribute('data-id'), category: null });
      };
    });
  }

  function renderSettings(content) {
    var s = DriveDocsStore.getSettings();
    content.innerHTML =
      '<div class="split-2">' +
        '<section class="card"><div class="card__hd"><h2 class="card__title">Google Drive（Demo）</h2></div><div class="card__bd">' +
          '<div class="field"><label>根目錄名稱</label><input id="s-root" value="' + escapeHtml(s.rootFolderName) + '"></div>' +
          '<div class="field"><label>命名規則</label><input id="s-naming" value="' + escapeHtml(s.namingRule) + '"></div>' +
          '<div class="field"><label>管理員</label><input id="s-admins" value="' + escapeHtml((s.admins || []).join(', ')) + '"></div>' +
          '<button type="button" class="btn btn--primary" id="btn-save-settings">儲存設定</button>' +
        '</div></section>' +
        '<section class="card"><div class="card__hd"><h2 class="card__title">資料夾模板</h2></div><div class="card__bd">' +
          '<div class="cat-editor" id="cat-editor">' +
            (s.categories || []).map(function (cat) {
              return '<div class="cat-editor__row"><input value="' + escapeHtml(cat) + '">' +
                '<button type="button" class="btn btn--ghost btn-rm-cat">移除</button></div>';
            }).join('') +
          '</div>' +
          '<div style="margin-top:0.75rem;display:flex;gap:0.5rem">' +
            '<button type="button" class="btn" id="btn-add-cat">新增分類</button>' +
            '<button type="button" class="btn btn--brand" id="btn-seed">重設示範資料</button>' +
          '</div></div></section></div>';

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
      DriveDocsStore.saveSettings({
        rootFolderName: $('s-root').value,
        namingRule: $('s-naming').value,
        categories: Array.prototype.map.call($('cat-editor').querySelectorAll('input'), function (inp) {
          return inp.value.trim();
        }).filter(Boolean),
        admins: $('s-admins').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean)
      });
      toast('設定已儲存');
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
      '<div class="split-2">' +
        '<section class="card"><div class="card__hd"><h2 class="card__title">客戶（' + res.customers.length + '）</h2></div>' +
        '<div class="card__bd"><div class="folder-strip">' +
          (res.customers.length ? res.customers.map(folderTile).join('') : '<p class="empty">沒有符合客戶</p>') +
        '</div></div></section>' +
        '<section class="card"><div class="card__hd"><h2 class="card__title">文件（' + res.files.length + '）</h2></div>' +
        '<div class="card__bd" style="padding:0;overflow:auto">' +
          (res.files.length
            ? '<table class="file-table"><thead><tr><th>檔名</th><th>客戶</th><th>分類</th></tr></thead><tbody>' +
              res.files.map(function (x) {
                return '<tr style="cursor:pointer" data-id="' + escapeHtml(x.customerId) + '"><td>' + escapeHtml(x.file.name) + '</td>' +
                  '<td>' + escapeHtml(x.customerName) + '</td><td>' + escapeHtml(x.file.category) + '</td></tr>';
              }).join('') + '</tbody></table>'
            : '<p class="empty">沒有符合文件</p>') +
        '</div></section></div>';
    content.querySelectorAll('.folder-tile, tr[data-id]').forEach(function (el) {
      el.onclick = function () {
        setPage('detail', { customerId: el.getAttribute('data-id'), category: null });
      };
    });
  }

  function showCreateCustomerModal() {
    openModal(
      '<h2>新建客戶資料夾</h2>' +
      '<div class="field"><label>姓名</label><input id="m-name" placeholder="王大明"></div>' +
      '<div class="field"><label>電話</label><input id="m-phone" placeholder="0912-123-456"></div>' +
      '<div class="field"><label>Email</label><input id="m-email"></div>' +
      '<div class="field"><label>標籤</label><input id="m-tags" placeholder="保險, VIP"></div>' +
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
          tags: $('m-tags').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean)
        });
        closeModal();
        toast('已建立「' + c.name + '」');
        setPage('detail', { customerId: c.id, category: null });
      } catch (err) { toast(err.message || err, true); }
    };
  }

  function boot() {
    document.querySelectorAll('.sider__item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPage(btn.getAttribute('data-page'));
      });
    });
    $('sidebar-toggle').addEventListener('click', function () {
      $('sidebar').classList.toggle('is-open');
    });
    $('global-search').addEventListener('input', function () {
      clearTimeout(state.searchTimer);
      var q = $('global-search').value.trim();
      state.searchTimer = setTimeout(function () {
        if (!q) {
          if (state.page === 'search') setPage('dashboard');
          return;
        }
        state.searchQuery = q;
        setPage('search');
      }, 250);
    });
    DriveDocsStore.listCustomers('zhuyin');
    setPage('dashboard');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
