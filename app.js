/* =====================================================================
 * app.js — State, Router, Render UI, Export. Dùng window.API & window.CONFIG
 * ===================================================================== */
(function () {
  const C = window.CONFIG;
  const fmt = window.API.fmt;

  /* -------------------- STATE TOÀN CỤC -------------------- */
  const AppState = {
    route: 'dashboard',
    cache: {},        // dữ liệu tải tạm theo màn hình
    planDraft: null,  // kế hoạch đang soạn (Bước 2)
    cart: [],         // giỏ vật tư tạm: [{...item, so_luong, don_gia_thuc_te, ly_do?}]
    poPreview: null,  // kết quả PO engine chờ xác nhận (Bước 3)
  };
  window.AppState = AppState;

  /* -------------------- DOM SHORTCUTS -------------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const view = () => $('#view');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* -------------------- TOAST -------------------- */
  function toast(msg, type = 'info', ms = 3200) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${esc(msg)}</span>`;
    $('#toastWrap').appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
  }
  window.toast = toast;

  /* -------------------- MODAL -------------------- */
  function openModal({ title, body, foot, wide }) {
    $('#modalTitle').textContent = title || '';
    $('#modalBody').innerHTML = body || '';
    $('#modalFoot').innerHTML = '';
    (foot || []).forEach(b => {
      const btn = document.createElement('button');
      btn.className = `btn ${b.class || 'btn-light'}`;
      btn.textContent = b.label;
      btn.onclick = b.onClick;
      $('#modalFoot').appendChild(btn);
    });
    $('#modalBox').classList.toggle('modal-wide', !!wide);
    $('#modalBox').classList.toggle('modal-xwide', !!arguments[0].xwide);
    $('#modalBackdrop').hidden = false;
  }
  function closeModal() { $('#modalBackdrop').hidden = true; $('#modalBody').innerHTML = ''; }
  window.openModal = openModal; window.closeModal = closeModal;
  $('#modalClose').onclick = closeModal;
  $('#modalBackdrop').onclick = (e) => { if (e.target.id === 'modalBackdrop') closeModal(); };

  /* -------------------- BADGE TRẠNG THÁI -------------------- */
  function statusBadge(st) {
    const map = {
      'Nháp': 'gray', 'Đã gửi đơn': 'blue', 'Đã chấp nhận đơn': 'cyan',
      'Đã giao hàng': 'indigo', 'Đã xuất hóa đơn': 'orange',
      'Thanh toán một phần': 'amber', 'Đã thanh toán': 'green', 'Đã hủy': 'red',
      'Đang thi công': 'blue', 'Tạm dừng': 'amber', 'Hoàn thành': 'green',
      'Đã duyệt': 'green', 'Đang thực hiện': 'blue', 'Hoàn tất': 'gray',
    };
    return `<span class="badge badge-${map[st] || 'gray'}">${esc(st)}</span>`;
  }
  window.statusBadge = statusBadge;

  /* -------------------- ROUTER -------------------- */
  const ROUTES = {
    dashboard: { title: 'Tổng quan', render: renderDashboard },
    congtrinh: { title: 'Công trình', render: renderCongTrinh },
    kehoach:   { title: 'Kế hoạch mua sắm', render: renderKeHoach },
    donhang:   { title: 'Đơn đặt hàng', render: renderDonHang },
    thanhtoan: { title: 'Thanh toán & Công nợ', render: renderThanhToan },
    danhmuc:   { title: 'Danh mục vật tư', render: renderDanhMuc },
    ncc:       { title: 'Nhà cung cấp', render: renderNCC },
    baocao:    { title: 'Báo cáo', render: renderBaoCao },
    caidat:    { title: 'Cài đặt & Sao lưu', render: renderCaiDat },
  };

  async function navigate(route) {
    if (!ROUTES[route]) route = 'dashboard';
    AppState.route = route;

    $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    $('#pageTitle').textContent = ROUTES[route].title;
    $('#topbarActions').innerHTML = '';
    view().innerHTML = '<div class="loading">Đang tải…</div>';
    try { await ROUTES[route].render(); }
    catch (e) { view().innerHTML = `<div class="empty">Lỗi: ${esc(e.message)}</div>`; console.error(e); }
  }
  window.navigate = navigate;

  $('#mainNav').addEventListener('click', (e) => {
    const a = e.target.closest('.nav-item'); if (!a) return;
    navigate(a.dataset.route);
    if (window.innerWidth < 900) $('#sidebar').classList.remove('open');
  });
  $('#btnToggleSidebar').onclick = () => $('#sidebar').classList.toggle('open');

  /* -------------------- TIỆN ÍCH UI -------------------- */
  function toolbarBtn(label, cls, onClick, icon) {
    const b = document.createElement('button');
    b.className = `btn ${cls}`; b.innerHTML = (icon ? icon + ' ' : '') + label; b.onclick = onClick;
    $('#topbarActions').appendChild(b); return b;
  }
  function emptyBox(msg) { return `<div class="empty">${esc(msg)}</div>`; }
  function card(html, cls = '') { return `<div class="card ${cls}">${html}</div>`; }

  /* ====================================================================
   *  MÀN HÌNH 1 — DASHBOARD
   * ==================================================================== */
  async function renderDashboard() {
    const [cts, khs, dhs, data] = await Promise.all([
      window.API.listCongTrinh(), window.API.listKeHoach(),
      window.API.listDonHang(), window.API.listData(),
    ]);
    const active = dhs.filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
    const totalPO = active.reduce((a, b) => a + (b.gia_tri_don_hang || 0), 0);

    // công nợ tổng
    let totalPaid = 0;
    for (const d of active) {
      const cn = await window.API.congNoByDon(d.id_don_hang);
      totalPaid += cn.paid;
    }
    const debt = totalPO - totalPaid;

    // phân bố trạng thái PO
    const byStatus = {};
    active.forEach(d => byStatus[d.trang_thai] = (byStatus[d.trang_thai] || 0) + 1);

    const kpis = [
      { label: 'Công trình', value: cts.length, sub: cts.filter(c => c.trang_thai === 'Đang thi công').length + ' đang thi công', icon: '🏗️', c: 'blue' },
      { label: 'Kế hoạch tháng', value: khs.length, sub: khs.filter(k => k.trang_thai_ke_hoach === 'Đang thực hiện').length + ' đang thực hiện', icon: '📅', c: 'cyan' },
      { label: 'Đơn đặt hàng', value: active.length, sub: fmt(totalPO), icon: '📦', c: 'indigo' },
      { label: 'Công nợ còn lại', value: fmt(debt), sub: 'Đã trả ' + fmt(totalPaid), icon: '💰', c: debt > 0 ? 'orange' : 'green' },
    ];

    view().innerHTML = `
      <div class="kpi-grid">
        ${kpis.map(k => `
          <div class="kpi kpi-${k.c}">
            <div class="kpi-ic">${k.icon}</div>
            <div class="kpi-main"><div class="kpi-val">${typeof k.value === 'number' ? k.value : k.value}</div>
            <div class="kpi-label">${k.label}</div><div class="kpi-sub">${esc(k.sub)}</div></div>
          </div>`).join('')}
      </div>

      <div class="grid-2">
        ${card(`<h3>Phân bố trạng thái đơn hàng</h3>
          ${Object.keys(byStatus).length ? Object.entries(byStatus).map(([s, n]) => `
            <div class="bar-row"><div class="bar-lbl">${statusBadge(s)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${(n / active.length * 100).toFixed(0)}%"></div></div>
              <div class="bar-num">${n}</div></div>`).join('') : emptyBox('Chưa có đơn hàng nào.')}`)}

        ${card(`<h3>Tổng quan danh mục</h3>
          <div class="mini-stat"><span>Tổng mặt hàng (DATA)</span><strong>${data.length}</strong></div>
          <div class="mini-stat"><span>Số nhóm hàng</span><strong>${C.DANH_MUC_NHOM.length}</strong></div>
          <div class="mini-stat"><span>Số nhà cung cấp</span><strong>${C.NHA_CUNG_CAP.length}</strong></div>
          <div class="mini-stat"><span>Vật tư dễ hư hỏng</span><strong>${data.filter(d => d.muc_do_hu_hong === 'Dễ hư hỏng').length}</strong></div>`)}
      </div>

      ${card(`<h3>Đơn hàng gần đây</h3>
        ${active.length ? `<table class="tbl"><thead><tr>
          <th>Mã đơn</th><th>NCC</th><th>Giá trị</th><th>Trạng thái</th><th>Ngày tạo</th></tr></thead><tbody>
          ${active.slice(-8).reverse().map(d => `<tr>
            <td><b>${esc(d.ma_don_hang)}</b></td><td>${esc(d.id_ncc)}</td>
            <td>${fmt(d.gia_tri_don_hang)}</td><td>${statusBadge(d.trang_thai)}</td>
            <td>${esc((d.ngay_tao || '').slice(0, 16))}</td></tr>`).join('')}
        </tbody></table>` : emptyBox('Chưa có đơn hàng. Hãy bắt đầu từ Kế hoạch mua sắm.')}`)}
    `;
  }

  /* ====================================================================
   *  MÀN HÌNH 2 — CÔNG TRÌNH
   * ==================================================================== */
  async function renderCongTrinh() {
    toolbarBtn('Thêm công trình', 'btn-primary', () => congTrinhForm(), '➕');
    const cts = await window.API.listCongTrinh();
    if (!cts.length) { view().innerHTML = emptyBox('Chưa có công trình. Nhấn "Thêm công trình" để tạo mới.'); return; }

    // số kế hoạch theo công trình
    const khs = await window.API.listKeHoach();
    view().innerHTML = card(`
      <table class="tbl">
        <thead><tr><th>Mã CT</th><th>Tên công trình</th><th>Địa điểm</th>
          <th>Thời gian</th><th>Số KH</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>${cts.map(c => {
          const cnt = khs.filter(k => k.id_cong_trinh === c.id_cong_trinh).length;
          return `<tr>
            <td><b>${esc(c.ma_cong_trinh)}</b></td>
            <td>${esc(c.ten_cong_trinh)}</td>
            <td>${esc(c.dia_diem || '')}</td>
            <td>${esc(c.ngay_bat_dau || '')} → ${esc(c.ngay_ket_thuc_du_kien || '')}</td>
            <td style="text-align:center">${cnt}</td>
            <td>${statusBadge(c.trang_thai)}</td>
            <td class="act">
              <button class="ibtn" data-edit="${c.id_cong_trinh}" title="Sửa">✏️</button>
              <button class="ibtn ibtn-danger" data-del="${c.id_cong_trinh}" title="Xóa">🗑️</button>
            </td></tr>`;
        }).join('')}</tbody>
      </table>`);


    $$('[data-edit]', view()).forEach(b => b.onclick = async () => {
      congTrinhForm(await window.API.getCongTrinh(b.dataset.edit));
    });

    $$('[data-del]', view()).forEach(b => b.onclick = () => {
      openModal({
        title: 'Xác nhận xóa', body: '<p>Xóa công trình này? Các kế hoạch liên quan sẽ không tự xóa.</p>',
        foot: [
          { label: 'Hủy', class: 'btn-light', onClick: closeModal },
          { label: 'Xóa', class: 'btn-danger', onClick: async () => {
            await window.API.delCongTrinh(b.dataset.del); closeModal(); toast('Đã xóa công trình', 'success'); renderCongTrinh();
          } },
        ],
      });
    });
  }

  function congTrinhForm(ct) {
    const e = ct || {};
    openModal({
      title: ct ? 'Sửa công trình' : 'Thêm công trình',
      body: `
        <div class="form-grid">
          <label>Mã công trình *<input id="f_ma" value="${esc(e.ma_cong_trinh || '')}" placeholder="VD: CT-2026-001"></label>
          <label>Tên công trình *<input id="f_ten" value="${esc(e.ten_cong_trinh || '')}"></label>
          <label class="col-2">Địa điểm<input id="f_dd" value="${esc(e.dia_diem || '')}"></label>
          <label>Ngày bắt đầu<input id="f_bd" type="date" value="${esc(e.ngay_bat_dau || '')}"></label>
          <label>Ngày KT dự kiến<input id="f_kt" type="date" value="${esc(e.ngay_ket_thuc_du_kien || '')}"></label>
          <label class="col-2">Trạng thái
            <select id="f_tt">${C.PROJECT_STATUS.map(s => `<option ${e.trang_thai === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </label>
        </div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Lưu', class: 'btn-primary', onClick: async () => {
          const ma = $('#f_ma').value.trim(), ten = $('#f_ten').value.trim();
          if (!ma || !ten) return toast('Vui lòng nhập Mã và Tên công trình', 'error');
          await window.API.saveCongTrinh({
            id_cong_trinh: e.id_cong_trinh,
            ma_cong_trinh: ma, ten_cong_trinh: ten,
            dia_diem: $('#f_dd').value.trim(),
            ngay_bat_dau: $('#f_bd').value, ngay_ket_thuc_du_kien: $('#f_kt').value,
            trang_thai: $('#f_tt').value,
          });
          closeModal(); toast('Đã lưu công trình', 'success'); renderCongTrinh();
        } },
      ],
    });
  }

  /* ====================================================================
   *  MÀN HÌNH 3 — KẾ HOẠCH MUA SẮM
   * ==================================================================== */
  async function renderKeHoach() {
    toolbarBtn('Lập kế hoạch mới', 'btn-primary', () => keHoachForm(), '➕'),
    toolbarBtn('⚡ Tạo đơn hàng loạt', 'btn-warn', () => openAutoGenerate());
    const [khs, cts] = await Promise.all([window.API.listKeHoach(), window.API.listCongTrinh()]);
    const ctMap = Object.fromEntries(cts.map(c => [c.id_cong_trinh, c]));

    if (!khs.length) { view().innerHTML = emptyBox('Chưa có kế hoạch. Nhấn "Lập kế hoạch mới".'); return; }

    // chi đã phân bổ theo kế hoạch
    const rows = [];
    for (const k of khs) {
      const dhs = (await window.API.listDonHangByKeHoach(k.id_ke_hoach))
        .filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
      const spent = dhs.reduce((a, b) => a + (b.gia_tri_don_hang || 0), 0);
      rows.push({ k, ct: ctMap[k.id_cong_trinh], spent, poCount: dhs.length });
    }

    view().innerHTML = card(`
      <table class="tbl">
        <thead><tr><th>Tháng</th><th>Công trình</th><th>Ngân sách</th><th>Đã phân bổ</th>
          <th>Sử dụng</th><th>Số PO</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>${rows.map(({ k, ct, spent, poCount }) => {
          const pct = k.tong_du_tru ? Math.min(100, spent / k.tong_du_tru * 100) : 0;
          const over = spent > k.tong_du_tru;
          return `<tr>
            <td><b>${esc(k.thang_nam)}</b></td>
            <td>${esc(ct ? ct.ten_cong_trinh : '—')}</td>
            <td>${fmt(k.tong_du_tru)}</td>
            <td class="${over ? 'txt-danger' : ''}">${fmt(spent)}</td>
            <td><div class="bar-track sm"><div class="bar-fill ${over ? 'bf-red' : pct > 80 ? 'bf-amber' : ''}" style="width:${pct.toFixed(0)}%"></div></div><small>${pct.toFixed(0)}%</small></td>
            <td style="text-align:center">${poCount}</td>
            <td>${statusBadge(k.trang_thai_ke_hoach)}</td>
            <td class="act">
              <button class="ibtn ibtn-primary" data-pick="${k.id_ke_hoach}" title="Chọn vật tư & tạo đơn">🛒</button>
              <button class="ibtn" data-edit="${k.id_ke_hoach}" title="Sửa">✏️</button>
              <button class="ibtn ibtn-danger" data-del="${k.id_ke_hoach}" title="Xóa">🗑️</button>
            </td></tr>`;
        }).join('')}</tbody>
      </table>`);


    $$('[data-pick]', view()).forEach(b => b.onclick = () => openPickItems(b.dataset.pick));

    $$('[data-edit]', view()).forEach(b => b.onclick = async () => keHoachForm(await window.API.getKeHoach(b.dataset.edit)));

    $$('[data-del]', view()).forEach(b => b.onclick = () => confirmDelKeHoach(b.dataset.del));
  }

  function confirmDelKeHoach(id) {
    openModal({
      title: 'Xác nhận xóa', body: '<p>Xóa kế hoạch này?</p>',
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Xóa', class: 'btn-danger', onClick: async () => {
          await window.API.delKeHoach(id); closeModal(); toast('Đã xóa kế hoạch', 'success'); renderKeHoach();
        } },
      ],
    });
  }

  async function keHoachForm(kh) {
    const e = kh || {};
    const cts = await window.API.listCongTrinh();
    if (!cts.length) return toast('Hãy tạo Công trình trước khi lập kế hoạch', 'error');
    openModal({
      title: kh ? 'Sửa kế hoạch' : 'Lập kế hoạch mua sắm',
      body: `
        <div class="form-grid">
          <label>Công trình *
            <select id="f_ct">${cts.map(c => `<option value="${c.id_cong_trinh}" ${e.id_cong_trinh === c.id_cong_trinh ? 'selected' : ''}>${esc(c.ten_cong_trinh)}</option>`).join('')}</select>
          </label>
          <label>Tháng/Năm *<input id="f_thang" type="month" value="${esc(e.thang_nam || new Date().toISOString().slice(0,7))}"></label>
          <label>Ngân sách trần (₫) *<input id="f_budget" type="number" min="0" value="${e.tong_du_tru || ''}" placeholder="VD: 50000000"></label>
          <label>Người lập<input id="f_nguoi" value="${esc(e.nguoi_lap || '')}"></label>
          <label class="col-2">Trạng thái
            <select id="f_tt">${Object.values(C.PLAN_STATUS).map(s => `<option ${e.trang_thai_ke_hoach === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </label>
          <label class="col-2">Ghi chú<textarea id="f_gc">${esc(e.ghi_chu || '')}</textarea></label>
        </div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Lưu', class: 'btn-primary', onClick: async () => {
          const budget = Number($('#f_budget').value);
          if (!$('#f_thang').value || !budget) return toast('Nhập đủ Tháng và Ngân sách', 'error');
          await window.API.saveKeHoach({
            id_ke_hoach: e.id_ke_hoach,
            thang_nam: $('#f_thang').value,
            id_cong_trinh: $('#f_ct').value,
            tong_du_tru: budget,
            trang_thai_ke_hoach: $('#f_tt').value || C.PLAN_STATUS.NHAP,
            nguoi_lap: $('#f_nguoi').value.trim(),
            ngay_lap: e.ngay_lap,
            ghi_chu: $('#f_gc').value.trim(),
          });
          closeModal(); toast('Đã lưu kế hoạch', 'success'); renderKeHoach();
        } },
      ],
    });
  }

  /* ====================================================================
   *  BƯỚC 2 — CHỌN VẬT TƯ (giỏ hàng + cảnh báo + thay thế)
   * ==================================================================== */
  async function openPickItems(id_ke_hoach) {
    const kh = await window.API.getKeHoach(id_ke_hoach);
    const data = await window.API.listData();
    AppState.planDraft = kh;
    AppState.cart = [];

    // chi đã phân bổ từ các PO sẵn có (để progress bar cộng dồn)
    const existPOs = (await window.API.listDonHangByKeHoach(id_ke_hoach))
      .filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
    const baseSpent = existPOs.reduce((a, b) => a + (b.gia_tri_don_hang || 0), 0);
    AppState.cache.baseSpent = baseSpent;

    const nccs = await window.API.listNCC();
    const nhoms = await window.API.listNhom();

    openModal({
      wide: true,
      title: `Chọn vật tư — ${esc(kh.thang_nam)}`,
      body: `
        <div class="pick-toolbar">
          <input id="pkSearch" placeholder="🔍 Tìm theo tên / mã hàng…" class="grow">
          <select id="pkNhom"><option value="">— Tất cả nhóm —</option>
            ${nhoms.map(n => `<option value="${n.id_nhom}">${esc(n.ten_nhom)}</option>`).join('')}</select>
          <select id="pkNcc"><option value="">— Tất cả NCC —</option>
            ${nccs.map(n => `<option value="${n.id_ncc}">${esc(n.id_ncc)} - ${esc(n.ten_ncc)}</option>`).join('')}</select>
        </div>
        <div class="pick-layout">
          <div class="pick-list" id="pkList"></div>
          <div class="pick-cart">
            <h4>Giỏ vật tư <span id="pkCount" class="pill">0</span></h4>
            <div id="pkCart" class="cart-body">${emptyBox('Chưa chọn vật tư')}</div>
            <div class="budget-box">
              <div class="budget-line"><span>Ngân sách</span><b>${fmt(kh.tong_du_tru)}</b></div>
              <div class="budget-line"><span>Đã có (PO cũ)</span><b>${fmt(baseSpent)}</b></div>
              <div class="budget-line"><span>Giỏ hiện tại</span><b id="pkCartSum">0 ₫</b></div>
              <div class="bar-track"><div id="pkBudgetBar" class="bar-fill" style="width:0%"></div></div>
              <div class="budget-line"><span>Còn lại</span><b id="pkRemain">${fmt(kh.tong_du_tru - baseSpent)}</b></div>
            </div>
          </div>
        </div>`,
      foot: [
        { label: 'Đóng', class: 'btn-light', onClick: () => { AppState.cart = []; closeModal(); } },
        { label: '⚙️ Tạo đơn tự động (Auto-Split)', class: 'btn-primary', onClick: () => runPoEngine() },
      ],
    });

    // lưu data đã enrich (đã có _ck_max, _gia_min...) để lọc nhanh
    AppState.cache.allData = data;
    const renderList = () => {
      const q = $('#pkSearch').value.trim().toLowerCase();
      const fNhom = $('#pkNhom').value, fNcc = $('#pkNcc').value;
      const filtered = data.filter(it => {
        if (q && !(`${it.ten_hang_hoa} ${it.ma_hang}`.toLowerCase().includes(q))) return false;
        if (fNhom && it.id_nhom !== fNhom) return false;          // R-01: lọc bằng id_nhom
        if (fNcc && C.GROUP_TO_NCC[it.ma_nhom] !== fNcc) return false;
        return true;
      }).slice(0, 120);
      $('#pkList').innerHTML = filtered.map(it => `
        <div class="pk-item" data-ma="${esc(it.ma_hang)}">
          <div class="pk-info">
            <b>${esc(it.ten_hang_hoa)}</b>
            <small>${esc(it.ma_hang)} · ${esc(it.phan_loai_nhom_hang)} · ${esc(C.GROUP_TO_NCC[it.ma_nhom])}</small>
            <small>${esc(it.dvt)} · ${fmt(it.don_gia)} · CK: ${esc(it.chu_ky_thay_the)} · ${esc(it.muc_do_hu_hong)}</small>
          </div>
          <button class="btn btn-sm btn-primary" data-add="${esc(it.ma_hang)}">+ Thêm</button>
        </div>`).join('') || emptyBox('Không có kết quả phù hợp');

      $$('[data-add]', $('#pkList')).forEach(b => b.onclick = () => addToCart(b.dataset.add));
    };
    $('#pkSearch').oninput = renderList;
    $('#pkNhom').onchange = renderList;
    $('#pkNcc').onchange = renderList;
    renderList();
  }

  // Thêm vật tư vào giỏ — kèm kiểm tra cảnh báo trùng lặp
  async function addToCart(ma_hang) {
    if (AppState.cart.find(c => c.ma_hang === ma_hang)) return toast('Vật tư đã có trong giỏ', 'info');
    const it = AppState.cache.allData.find(d => d.ma_hang === ma_hang);
    const dup = await window.API.checkDuplicate(ma_hang);

    const doAdd = (ly_do) => {
      AppState.cart.push({ ...it, so_luong: 1, don_gia_thuc_te: it.don_gia, ly_do: ly_do || '' });
      renderCart();
      if (dup.level === 'info') toast('Đã thêm (badge: Đã mua T-1)', 'info');
      else toast('Đã thêm vào giỏ', 'success');
    };

    if (dup.level === 'red') {
      // BẮT BUỘC nhập lý do
      openModal({
        title: '🔴 Cảnh báo Đỏ — Bất thường nghiêm trọng',
        body: `<p>Mặt hàng <b>${esc(it.ten_hang_hoa)}</b> có chu kỳ thay thế dài (>12 tháng) nhưng vừa mua cách đây <b>${dup.monthsSince.toFixed(1)} tháng</b> (lần cuối: ${esc(dup.lastDate)}).</p>
          <p>Bạn <b>bắt buộc</b> nhập lý do để tiếp tục, hoặc chọn Thay thế.</p>
          <label>Lý do bắt buộc *<textarea id="pkReason" placeholder="VD: vật tư bị hỏng đột xuất do sự cố…"></textarea></label>`,
        foot: [
          { label: 'Hủy', class: 'btn-light', onClick: closeAddModal },
          { label: '🔄 Thay thế', class: 'btn-warn', onClick: () => openSubstitutes(ma_hang) },
          { label: 'Thêm kèm lý do', class: 'btn-danger', onClick: () => {
            const r = $('#pkReason').value.trim();
            if (!r) return toast('Bắt buộc nhập lý do', 'error');
            closeAddModal(); doAdd('[ĐỎ] ' + r);
          } },
        ],
      });
    } else if (dup.level === 'yellow') {
      openModal({
        title: '🟡 Cảnh báo trùng lặp',
        body: `<p>Mặt hàng <b>${esc(it.ten_hang_hoa)}</b> đã mua cách đây <b>${dup.monthsSince.toFixed(1)} tháng</b> (lần cuối: ${esc(dup.lastDate)}), trong khi chu kỳ thay thế còn dài.</p>
          <p>Bạn có chắc muốn thêm?</p>`,
        foot: [
          { label: 'Hủy', class: 'btn-light', onClick: closeAddModal },
          { label: '🔄 Thay thế', class: 'btn-warn', onClick: () => openSubstitutes(ma_hang) },
          { label: 'Vẫn thêm', class: 'btn-primary', onClick: () => { closeAddModal(); doAdd('[VÀNG] xác nhận thêm'); } },
        ],
      });
    } else {
      doAdd();
    }
  }
  // Khi cảnh báo bật trên modal chọn vật tư, ta KHÔNG đóng modal gốc -> chỉ đóng lớp cảnh báo
  function closeAddModal() {
    // mở lại modal chọn vật tư nếu đã bị thay nội dung
    if (AppState.planDraft) openPickItems(AppState.planDraft.id_ke_hoach);
    // giữ giỏ: openPickItems reset cart -> phải khôi phục
  }

  // Gợi ý thay thế (AI hoặc nội bộ)
  async function openSubstitutes(ma_hang) {
    const base = AppState.cache.allData.find(d => d.ma_hang === ma_hang);
    openModal({ title: '🔄 Đang tìm vật tư thay thế…', body: '<div class="loading">Đang phân tích…</div>', foot: [] });
    const subs = await window.API.suggestSubstitutes(ma_hang);
    const ai = await window.API.aiStatus();
    openModal({
      title: '🔄 Gợi ý thay thế' + (ai.gemini ? ' (Gemini AI)' : ' (nội bộ)'),
      body: `<p>Thay cho: <b>${esc(base.ten_hang_hoa)}</b> (${fmt(base.don_gia)})</p>
        ${subs.length ? subs.map(s => `
          <div class="pk-item">
            <div class="pk-info"><b>${esc(s.ten_hang_hoa)}</b>
              <small>${esc(s.ma_hang)} · ${fmt(s.don_gia)} · ${esc(s.muc_dich_su_dung)}</small></div>
            <button class="btn btn-sm btn-primary" data-sub="${esc(s.ma_hang)}">Chọn</button>
          </div>`).join('') : emptyBox('Không tìm thấy mặt hàng thay thế phù hợp.')}`,
      foot: [{ label: 'Đóng', class: 'btn-light', onClick: closeAddModal }],
    });

    $$('[data-sub]', $('#modalBody')).forEach(b => b.onclick = () => {
      const it = AppState.cache.allData.find(d => d.ma_hang === b.dataset.sub);
      if (!AppState.cart.find(c => c.ma_hang === it.ma_hang))
        AppState.cart.push({ ...it, so_luong: 1, don_gia_thuc_te: it.don_gia, ly_do: '[Thay thế cho ' + ma_hang + ']' });
      closeAddModal(); toast('Đã thêm vật tư thay thế', 'success');
    });
  }

  // Render giỏ hàng + progress bar ngân sách (thời gian thực)
  function renderCart() {
    const cartBox = $('#pkCart'); if (!cartBox) return;
    const kh = AppState.planDraft;
    if (!AppState.cart.length) { cartBox.innerHTML = emptyBox('Chưa chọn vật tư'); }
    else {
      cartBox.innerHTML = AppState.cart.map((c, i) => `
        <div class="cart-item">
          <div class="ci-top"><b>${esc(c.ten_hang_hoa)}</b>
            <button class="ibtn ibtn-danger" data-rm="${i}">✕</button></div>
          <div class="ci-row">
            <label>SL<input type="number" min="1" step="1" value="${c.so_luong}" data-qty="${i}"></label>
            <label>Đơn giá<input type="number" min="0" value="${c.don_gia_thuc_te}" data-price="${i}"></label>
            <span class="ci-amt">${fmt(c.so_luong * c.don_gia_thuc_te)}</span>
          </div>
          ${c.ly_do ? `<small class="ci-note">📝 ${esc(c.ly_do)}</small>` : ''}
        </div>`).join('');

      $$('[data-rm]', cartBox).forEach(b => b.onclick = () => { AppState.cart.splice(+b.dataset.rm, 1); renderCart(); });

      $$('[data-qty]', cartBox).forEach(inp => inp.onchange = () => {
        const v = Math.max(1, Math.round(+inp.value || 1)); AppState.cart[+inp.dataset.qty].so_luong = v; renderCart();
      });

      $$('[data-price]', cartBox).forEach(inp => inp.onchange = () => {
        AppState.cart[+inp.dataset.price].don_gia_thuc_te = Math.max(0, +inp.value || 0); renderCart();
      });
    }
    const cartSum = AppState.cart.reduce((a, c) => a + c.so_luong * c.don_gia_thuc_te, 0);
    const total = (AppState.cache.baseSpent || 0) + cartSum;
    const pct = kh.tong_du_tru ? Math.min(100, total / kh.tong_du_tru * 100) : 0;
    const over = total > kh.tong_du_tru;
    $('#pkCount').textContent = AppState.cart.length;
    $('#pkCartSum').textContent = fmt(cartSum);
    $('#pkRemain').textContent = fmt(kh.tong_du_tru - total);
    $('#pkRemain').className = over ? 'txt-danger' : '';
    const bar = $('#pkBudgetBar');
    bar.style.width = pct.toFixed(0) + '%';
    bar.className = 'bar-fill ' + (over ? 'bf-red' : pct > 80 ? 'bf-amber' : '');
  }

  /* ====================================================================
   *  BƯỚC 3 — PO ENGINE + PREVIEW (Auto-Split)
   * ==================================================================== */
  async function runPoEngine() {
    if (!AppState.cart.length) return toast('Giỏ vật tư trống', 'error');
    const kh = AppState.planDraft;
    const cartSum = AppState.cart.reduce((a, c) => a + c.so_luong * c.don_gia_thuc_te, 0);
    const total = (AppState.cache.baseSpent || 0) + cartSum;

    // R-02: chặn nếu vượt ngân sách
    if (total > kh.tong_du_tru) {
      return toast(`Tổng phân bổ ${fmt(total)} vượt ngân sách ${fmt(kh.tong_du_tru)}. Không thể tạo đơn.`, 'error', 5000);
    }

    const result = await window.API.buildPurchaseOrders({
      thang_nam: kh.thang_nam,
      items: AppState.cart,
      minOrder: C.ORDER_CONSTRAINTS.MIN_ORDER,
      maxOrder: C.ORDER_CONSTRAINTS.MAX_ORDER,
    });
    AppState.poPreview = result;

    const nccMap = Object.fromEntries((await window.API.listNCC()).map(n => [n.id_ncc, n.ten_ncc]));
    AppState.poPreview = result;
    showAutoPreview(result, kh, kh.tong_du_tru - (AppState.cache.baseSpent || 0));

  }

  // Ghi các PO + chi tiết vào IndexedDB cập nhật commitPOs để chống tạo đơn rỗng / vượt ngân sách / dòng thiếu thông tin 
    async function commitPOs() {
    const kh = AppState.planDraft;
    const result = AppState.poPreview;
    if (!result || !result.purchase_orders.length) return toast('Không còn đơn nào để tạo', 'error');

    // Validate sau chỉnh sửa (Debug 2)
    for (const po of result.purchase_orders) {
      po._lines = po._lines.filter(l => l.ten_hang_hoa && l.so_luong > 0); // bỏ dòng trống
      po._lines.forEach(l => { l.thanh_tien = l.so_luong * l.don_gia_thuc_te; });
      po.gia_tri_don_hang = po._lines.reduce((a, l) => a + l.thanh_tien, 0);
      if (!po._lines.length) return toast(`Đơn ${po.ma_don_hang} không có dòng hợp lệ`, 'error', 5000);
    }
    const total = result.purchase_orders.reduce((a, p) => a + p.gia_tri_don_hang, 0);
    const budget = (AppState.cache.previewBudget != null) ? AppState.cache.previewBudget
                 : (kh.tong_du_tru - (AppState.cache.baseSpent || 0));
    if (total > budget) return toast(`Tổng ${fmt(total)} vượt ngân sách còn lại ${fmt(budget)}`, 'error', 5000);

    for (const po of result.purchase_orders) {
      const poObj = {
        id_don_hang: po.id_don_hang, ma_don_hang: po.ma_don_hang,
        id_ke_hoach: kh.id_ke_hoach, id_ncc: po.id_ncc,
        gia_tri_don_hang: po.gia_tri_don_hang, trang_thai: C.PO_STATUS.NHAP,
        ngay_gui: null, ghi_chu: (po.warnings || []).join(' | '),
      };
      await window.API.saveDonHang(poObj);
      for (const l of po._lines) {
        await window.API.saveChiTiet({
          id_don_hang: po.id_don_hang, ma_hang: l.ma_hang || '(tùy chỉnh)', ten_hang_hoa: l.ten_hang_hoa,
          dvt: l.dvt || '', so_luong: l.so_luong,
          don_gia_de_xuat: l.don_gia_thuc_te, don_gia_thuc_te: l.don_gia_thuc_te,
          thanh_tien: l.thanh_tien, ghi_chu_dong: '',
        });
      }
    }
    if (kh.trang_thai_ke_hoach === C.PLAN_STATUS.NHAP || kh.trang_thai_ke_hoach === C.PLAN_STATUS.DA_DUYET) {
      kh.trang_thai_ke_hoach = C.PLAN_STATUS.DANG_THUC_HIEN;
      await window.API.saveKeHoach(kh);
    }
    AppState.cart = []; AppState.poPreview = null;
    closeModal();
    toast(`Đã tạo ${result.purchase_orders.length} đơn hàng`, 'success');
    navigate('donhang');
  }

  /* ====================================================================
   *  BẢN VÁ: giữ giỏ khi đóng lớp cảnh báo/thay thế
   *  Ghi đè closeAddModal để KHÔI PHỤC giỏ thay vì reset.
   * ==================================================================== */
  closeAddModal = function () {
    const savedCart = AppState.cart.slice();
    const idkh = AppState.planDraft && AppState.planDraft.id_ke_hoach;
    if (idkh) {
      openPickItems(idkh).then(() => {
        AppState.cart = savedCart;   // khôi phục giỏ
        renderCart();
      });
    } else {
      closeModal();
    }
  };

  /* ====================================================================
   *  MÀN HÌNH 4 — ĐƠN ĐẶT HÀNG (vòng đời PO)
   * ==================================================================== */
  async function renderDonHang() {
    toolbarBtn('📊 Xuất Excel theo kỳ', 'btn-primary', () => openExportPeriod());
    const [dhs, khs, cts] = await Promise.all([
      window.API.listDonHang(), window.API.listKeHoach(), window.API.listCongTrinh(),
    ]);
    const khMap = Object.fromEntries(khs.map(k => [k.id_ke_hoach, k]));
    const ctMap = Object.fromEntries(cts.map(c => [c.id_cong_trinh, c]));

    if (!dhs.length) { view().innerHTML = emptyBox('Chưa có đơn hàng. Hãy tạo từ Kế hoạch mua sắm.'); return; }

    // bộ lọc trạng thái
    const allStatus = Object.values(C.PO_STATUS);
    view().innerHTML = `
      <div class="filter-bar">
        <select id="dhFilter"><option value="">— Tất cả trạng thái —</option>
          ${allStatus.map(s => `<option>${s}</option>`).join('')}</select>
        <input id="dhSearch" placeholder="🔍 Tìm mã đơn / NCC…">
      </div>
      <div id="dhTableWrap"></div>`;

    const draw = () => {
      const fs = $('#dhFilter').value, q = $('#dhSearch').value.trim().toLowerCase();
      const rows = dhs.filter(d =>
        (!fs || d.trang_thai === fs) &&
        (!q || `${d.ma_don_hang} ${d.id_ncc}`.toLowerCase().includes(q))
      ).sort((a, b) => (b.ngay_tao || '').localeCompare(a.ngay_tao || ''));

      $('#dhTableWrap').innerHTML = card(rows.length ? `
        <table class="tbl"><thead><tr>
          <th>Mã đơn</th><th>Công trình</th><th>NCC</th><th>Giá trị</th>
          <th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
        <tbody>${rows.map(d => {
          const kh = khMap[d.id_ke_hoach], ct = kh ? ctMap[kh.id_cong_trinh] : null;
          return `<tr>
            <td><b>${esc(d.ma_don_hang)}</b></td>
            <td>${esc(ct ? ct.ten_cong_trinh : '—')}</td>
            <td>${esc(d.id_ncc)}</td>
            <td>${fmt(d.gia_tri_don_hang)}</td>
            <td>${statusBadge(d.trang_thai)}</td>
            <td>${esc((d.ngay_tao || '').slice(0, 16))}</td>
              <td class="act">
              <button class="ibtn ibtn-primary" data-view="${d.id_don_hang}" title="Chi tiết">👁️</button>
              ${[C.PO_STATUS.NHAP, C.PO_STATUS.DA_GUI].includes(d.trang_thai)
                ? `<button class="ibtn ibtn-warn" data-editpo="${d.id_don_hang}" title="Sửa đơn">✏️</button>` : ''}
              <button class="ibtn" data-pdf="${d.id_don_hang}" title="In PDF">🖨️</button>
              <button class="ibtn" data-xls="${d.id_don_hang}" title="Xuất Excel">📤</button>
              ${C.PO_NO_DELETE_FROM.includes(d.trang_thai) ? '' : `<button class="ibtn ibtn-danger" data-del="${d.id_don_hang}" title="Xóa">🗑️</button>`}
            </td>
            </tr>`;
        }).join('')}</tbody></table>` : emptyBox('Không có đơn hàng phù hợp.'));


      $$('[data-view]', view()).forEach(b => b.onclick = () => openPoDetail(b.dataset.view));
      
      $$('[data-editpo]', view()).forEach(b => b.onclick = () => openPoEditor(b.dataset.editpo));

      $$('[data-pdf]', view()).forEach(b => b.onclick = () => printPO(b.dataset.pdf));

      $$('[data-xls]', view()).forEach(b => b.onclick = () => exportPoExcel(b.dataset.xls));

      $$('[data-del]', view()).forEach(b => b.onclick = () => confirmDelPO(b.dataset.del));
    };
    $('#dhFilter').onchange = draw;
    $('#dhSearch').oninput = draw;
    draw();
  }

  /* ====================================================================
   *  DEBUG 4 — XUẤT EXCEL THEO KỲ: chọn tháng -> mỗi NCC 1 sheet,
   *  gộp tất cả đơn của NCC đó trong tháng vào CÙNG 1 sheet (không tách).
   * ==================================================================== */
  async function openExportPeriod() {
    const dhs = (await window.API.listDonHang()).filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
    // tập các tháng có đơn (lấy theo mã PO: PO-YYYYMM-... -> YYYY-MM)
    const months = [...new Set(dhs.map(d => {
      const m = /PO-(\d{4})(\d{2})-/.exec(d.ma_don_hang); return m ? `${m[1]}-${m[2]}` : (d.ngay_tao||'').slice(0,7);
    }).filter(Boolean))].sort().reverse();
    if (!months.length) return toast('Chưa có đơn nào để xuất', 'error');

    openModal({
      title: '📊 Xuất Excel theo kỳ (gộp theo NCC)',
      body: `<div class="form-grid">
          <label class="col-2">Chọn kỳ (tháng) *
            <select id="ep_month">${months.map(m => `<option>${m}</option>`).join('')}</select></label>
        </div>
        <div class="alert sm">Mỗi nhà cung cấp sẽ là 1 sheet, gộp toàn bộ đơn của NCC đó trong kỳ vào cùng một sheet (không tách đơn). File kẻ khung, vừa khổ A4.</div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: '⬇️ Xuất file', class: 'btn-primary', onClick: () => runExportPeriod($('#ep_month').value) },
      ],
    });
  }

  async function runExportPeriod(month) {
    const monthKey = month.replace('-', ''); // YYYYMM
    const dhs = (await window.API.listDonHang()).filter(d => {
      if (d.trang_thai === C.PO_STATUS.DA_HUY) return false;
      const m = /PO-(\d{6})-/.exec(d.ma_don_hang);
      const k = m ? m[1] : (d.ngay_tao||'').slice(0,7).replace('-','');
      return k === monthKey;
    });
    if (!dhs.length) return toast('Kỳ này không có đơn hàng', 'error');

    const nccList = await window.API.listNCC();
    const nccMap = Object.fromEntries(nccList.map(n => [n.id_ncc, n]));
    // gom đơn theo NCC
    const byNcc = {};
    for (const d of dhs) (byNcc[d.id_ncc] = byNcc[d.id_ncc] || []).push(d);

    const wb = XLSX.utils.book_new();
    for (const idNcc of Object.keys(byNcc).sort()) {
      const orders = byNcc[idNcc].sort((a,b)=>a.ma_don_hang.localeCompare(b.ma_don_hang));
      // nạp chi tiết
      const detail = [];
      let grand = 0;
      for (const po of orders) {
        const cts = await window.API.listChiTietByDon(po.id_don_hang);
        detail.push({ po, cts });
        grand += po.gia_tri_don_hang;
      }
      const ws = buildNccPeriodSheet(month, nccMap[idNcc] || { id_ncc:idNcc, ten_ncc:idNcc }, detail, grand);
      setA4(ws);
      XLSX.utils.book_append_sheet(wb, ws, idNcc); // tên sheet = mã NCC
    }
    XLSX.writeFile(wb, `DonHang_${month}_TheoNCC.xlsx`);
    toast(`Đã xuất ${Object.keys(byNcc).length} NCC trong kỳ ${month}`, 'success');
  }

  // 1 sheet = 1 NCC, gộp nhiều đơn liên tiếp (mỗi đơn 1 block, chung 1 sheet)
  function buildNccPeriodSheet(month, ncc, detail, grand) {
    const NC = 8; // STT,Mã đơn,Mã hàng,Tên,ĐVT,SL,Đơn giá,Thành tiền
    const aoa = [];
    aoa.push([`BẢNG TỔNG HỢP ĐƠN ĐẶT HÀNG — KỲ ${month}`, '', '', '', '', '', '', '']);
    aoa.push([`Nhà cung cấp: ${ncc.id_ncc} - ${ncc.ten_ncc}`, '', '', '', '', '', '', '']);
    aoa.push([`Số đơn trong kỳ: ${detail.length}`, '', '', '', '', '', '', '']);
    const headRow = 3;
    aoa.push(['STT', 'Mã đơn', 'Mã hàng', 'Tên hàng hóa', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền']);

    const merges = [
      { s:{r:0,c:0}, e:{r:0,c:NC-1} },
      { s:{r:1,c:0}, e:{r:1,c:NC-1} },
      { s:{r:2,c:0}, e:{r:2,c:NC-1} },
    ];
    const subtotalRows = [];
    let stt = 1;
    detail.forEach(({ po, cts }) => {
      cts.forEach(c => aoa.push([stt++, po.ma_don_hang, c.ma_hang, c.ten_hang_hoa, c.dvt, c.so_luong, c.don_gia_thuc_te, c.thanh_tien]));
      // dòng cộng phụ theo đơn
      aoa.push(['', '', '', '', '', '', `Cộng đơn ${po.ma_don_hang}`, po.gia_tri_don_hang]);
      subtotalRows.push(aoa.length - 1);
    });
    aoa.push(['', '', '', '', '', '', 'TỔNG CỘNG TOÀN KỲ', grand]);
    const totalRow = aoa.length - 1;

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:5},{wch:20},{wch:12},{wch:36},{wch:7},{wch:7},{wch:13},{wch:15}];
    // merge các ô nhãn "Cộng đơn" (cột 6) — giữ đơn giản, chỉ style
    ws['!merges'] = merges;

    // Style
    styleRange(ws, 0, 0, 0, NC-1, () => XL.title());
    styleRange(ws, 1, 2, 0, NC-1, () => XL.sub());
    styleRange(ws, headRow, headRow, 0, NC-1, () => XL.head());
    // vùng dữ liệu: từ headRow+1 đến totalRow
    for (let r = headRow + 1; r <= totalRow; r++) {
      const isSub = subtotalRows.includes(r);
      const isTotal = r === totalRow;
      for (let c = 0; c < NC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        if (isTotal) ws[addr].s = (c >= 6) ? XL.total() : XL.cell('left');
        else if (isSub) ws[addr].s = (c === 7) ? XL.money() : (c === 6 ? { font:{bold:true,italic:true,sz:10}, alignment:{horizontal:'right'}, border: XL.border() } : XL.cell('left'));
        else ws[addr].s = (c===0||c===4||c===5) ? XL.cell('center') : (c===6||c===7) ? XL.money() : XL.cell('left');
      }
    }
    ws['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:totalRow,c:NC-1} });
    return ws;
  }

    /* ====================================================================
   *  DEBUG 3 — SỬA ĐƠN HÀNG (chỉ khi Nháp / Đã gửi đơn)
   *  Cùng cơ chế editor với Debug 2: thêm/xóa dòng, sửa SL/đơn giá/tên.
   * ==================================================================== */
  /* ====================================================================
   *  SỬA ĐƠN HÀNG TOÀN DIỆN (Debug)
   *  - Sửa Mã đơn, Nhà cung cấp, Mã công trình (qua ô nhập-tìm gợi ý)
   *  - Thêm/Xóa dòng, sửa Mã hàng/Tên/ĐVT/SL/Đơn giá
   *  Chỉ cho sửa khi đơn ở trạng thái Nháp / Đã gửi đơn.
   * ==================================================================== */
  async function openPoEditor(id) {
    const po = await window.API.getDonHang(id);
    if (![C.PO_STATUS.NHAP, C.PO_STATUS.DA_GUI].includes(po.trang_thai))
      return toast('Chỉ sửa được đơn ở trạng thái Nháp / Đã gửi đơn', 'error');

    const [cts, nccList, cts2, khs] = await Promise.all([
      window.API.listChiTietByDon(id),
      window.API.listNCC(),
      window.API.listCongTrinh(),
      window.API.listKeHoach(),
    ]);
    AppState.cache.allData = AppState.cache.allData || await window.API.listData();

    const kh = po.id_ke_hoach ? khs.find(k => k.id_ke_hoach === po.id_ke_hoach) : null;
    const curCt = kh ? cts2.find(c => c.id_cong_trinh === kh.id_cong_trinh) : null;

    AppState.cache.poEdit = {
      id_don_hang: id,
      ma_don_hang: po.ma_don_hang,
      id_ncc: po.id_ncc,
      id_ke_hoach: po.id_ke_hoach || null,
      id_cong_trinh: curCt ? curCt.id_cong_trinh : (kh ? kh.id_cong_trinh : null),
      nccList, ctList: cts2,
      origCt: cts,
      lines: cts.map(c => ({
        id_chi_tiet: c.id_chi_tiet, ma_hang: c.ma_hang, ten_hang_hoa: c.ten_hang_hoa,
        dvt: c.dvt, so_luong: c.so_luong, don_gia_thuc_te: c.don_gia_thuc_te,
        thanh_tien: c.thanh_tien,
      })),
    };

    openModal({
      wide: true,
      title: '✏️ Sửa đơn — ' + po.ma_don_hang,
      body: `
        <div class="form-grid">
          <label>Mã đơn hàng *
            <input id="pe_ma" value="${esc(po.ma_don_hang)}" placeholder="VD: PO-202606-NCC001-001"></label>
          <label>Nhà cung cấp * (gõ để tìm)
            <div class="combo" id="combo_ncc">
              <input type="text" class="combo-inp" id="pe_ncc" autocomplete="off"
                value="${esc(nccDisplay(nccList, po.id_ncc))}" placeholder="Gõ mã hoặc tên NCC…">
              <input type="hidden" id="pe_ncc_id" value="${esc(po.id_ncc || '')}">
              <div class="combo-menu" id="menu_ncc" hidden></div>
            </div>
          </label>
          <label class="col-2">Công trình (gõ để tìm)
            <div class="combo" id="combo_ct">
              <input type="text" class="combo-inp" id="pe_ct" autocomplete="off"
                value="${esc(ctDisplay(cts2, AppState.cache.poEdit.id_cong_trinh))}" placeholder="Gõ mã hoặc tên công trình…">
              <input type="hidden" id="pe_ct_id" value="${esc(AppState.cache.poEdit.id_cong_trinh || '')}">
              <div class="combo-menu" id="menu_ct" hidden></div>
            </div>
          </label>
          <label>Trạng thái
            <select id="pe_tt">${Object.values(C.PO_STATUS).map(s => `<option ${po.trang_thai === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </label>
          <label>Ngày tạo đơn
            <input id="pe_ngay" type="datetime-local" value="${esc(toDatetimeLocal(po.ngay_tao))}">
          </label>
        </div>
        <div class="po-card" style="margin-top:14px">
          <div id="poEditOne"></div>
          <button class="btn btn-sm btn-light" id="poEditAdd">➕ Thêm dòng</button>
        </div>
        <div class="alert" id="poEditOneSum"></div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: '💾 Lưu thay đổi', class: 'btn-primary', onClick: () => savePoEditor() },
      ],
    });
    renderPoEditorOne();
    // Gắn combobox gõ-để-tìm cho NCC & Công trình
    setupCombo('combo_ncc', 'pe_ncc', 'pe_ncc_id', 'menu_ncc',
      nccList.map(n => ({ id: n.id_ncc, label: `${n.id_ncc} - ${n.ten_ncc}`, search: `${n.id_ncc} ${n.ten_ncc}`.toLowerCase() })));
    setupCombo('combo_ct', 'pe_ct', 'pe_ct_id', 'menu_ct',
      cts2.map(c => ({ id: c.id_cong_trinh, label: `${c.ma_cong_trinh} - ${c.ten_cong_trinh}`, search: `${c.ma_cong_trinh} ${c.ten_cong_trinh}`.toLowerCase() })));
  }

  // Hiển thị "NCCxxx - Tên NCC" từ id
  function nccDisplay(list, id) {
    const n = list.find(x => x.id_ncc === id);
    return n ? `${n.id_ncc} - ${n.ten_ncc}` : (id || '');
  }
  // Hiển thị "Mã CT - Tên CT" từ id
  function ctDisplay(list, id) {
    const c = list.find(x => x.id_cong_trinh === id);
    return c ? `${c.ma_cong_trinh} - ${c.ten_cong_trinh}` : '';
  }

  // Chuyển "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm" (cho input datetime-local)
  function toDatetimeLocal(s) {
    if (!s) return '';
    const m = String(s).replace(' ', 'T');
    return m.slice(0, 16);
  }
  // Chuyển ngược lại để lưu
  function fromDatetimeLocal(s) {
    if (!s) return '';
    return s.replace('T', ' ') + (s.length === 16 ? ':00' : '');
  }

  /* ====================================================================
   *  COMBOBOX gõ-để-tìm (dùng cho NCC, Công trình…)
   *  inpId: ô nhập hiển thị | hidId: ô ẩn lưu id | menuId: vùng danh sách
   *  items: [{id, label, search}]
   * ==================================================================== */
  function setupCombo(comboId, inpId, hidId, menuId, items) {
    const wrap = document.getElementById(comboId);
    const inp = document.getElementById(inpId);
    const hid = document.getElementById(hidId);
    const menu = document.getElementById(menuId);
    if (!inp || !menu) return;

    const draw = (q) => {
      const kw = (q || '').trim().toLowerCase();
      const list = !kw ? items : items.filter(it => it.search.includes(kw));
      menu.innerHTML = list.length
        ? list.slice(0, 60).map(it => `<div class="combo-item" data-id="${esc(it.id)}" data-label="${esc(it.label)}">${esc(it.label)}</div>`).join('')
        : `<div class="combo-empty">Không tìm thấy</div>`;
      menu.hidden = false;
      // gắn click chọn
      Array.from(menu.querySelectorAll('.combo-item')).forEach(el => {
        el.onmousedown = (e) => {   // mousedown để chạy trước blur
          e.preventDefault();
          inp.value = el.dataset.label;
          hid.value = el.dataset.id;
          menu.hidden = true;
        };
      });
    };

    inp.addEventListener('focus', () => draw(inp.value));
    inp.addEventListener('input', () => { hid.value = ''; draw(inp.value); });
    inp.addEventListener('blur', () => { setTimeout(() => { menu.hidden = true; }, 150); });
  }

  function renderPoEditorOne() {
    const E = AppState.cache.poEdit;
    E.lines.forEach(l => l.thanh_tien = (l.so_luong || 0) * (l.don_gia_thuc_te || 0));
    const total = E.lines.reduce((a, l) => a + l.thanh_tien, 0);

    $('#poEditOne').innerHTML = `
      <table class="tbl sm po-edit-tbl">
        <thead><tr><th style="width:120px">Mã</th><th>Tên mặt hàng</th><th style="width:70px">ĐVT</th>
          <th style="width:80px">SL</th><th style="width:120px">Đơn giá</th><th style="width:120px">Thành tiền</th><th style="width:40px"></th></tr></thead>
        <tbody>${E.lines.map((l, i) => `
          <tr>
            <td><input class="cell-inp" list="dlMaHangPo" value="${esc(l.ma_hang || '')}" data-f="ma" data-i="${i}" placeholder="Mã / tên"></td>
            <td><input class="cell-inp" value="${esc(l.ten_hang_hoa || '')}" data-f="ten" data-i="${i}" placeholder="Tên mặt hàng"></td>
            <td><input class="cell-inp" value="${esc(l.dvt || '')}" data-f="dvt" data-i="${i}"></td>
            <td><input class="cell-inp" type="number" min="1" value="${l.so_luong}" data-f="sl" data-i="${i}"></td>
            <td><input class="cell-inp" type="number" min="0" value="${l.don_gia_thuc_te}" data-f="dg" data-i="${i}"></td>
            <td class="cell-amt">${fmt(l.thanh_tien)}</td>
            <td><button class="ibtn ibtn-danger" data-rm="${i}" title="Xóa dòng">✕</button></td>
          </tr>`).join('')}</tbody>
      </table>
      <datalist id="dlMaHangPo">${(AppState.cache.allData || []).slice(0,1000)
        .map(d => `<option value="${esc(d.ma_hang)}">${esc(d.ten_hang_hoa)}</option>`).join('')}</datalist>`;
    $('#poEditOneSum').innerHTML = `Giá trị đơn sau sửa: <b>${fmt(total)}</b>`;


    $$('[data-f]', $('#poEditOne')).forEach(inp => inp.onchange = () => {
      const i = +inp.dataset.i, f = inp.dataset.f, line = E.lines[i];
      if (f === 'sl') line.so_luong = Math.max(1, Math.round(+inp.value || 1));
      else if (f === 'dg') line.don_gia_thuc_te = Math.max(0, +inp.value || 0);
      else if (f === 'dvt') line.dvt = inp.value.trim();
      else if (f === 'ten') line.ten_hang_hoa = inp.value.trim();
      else if (f === 'ma') {
        line.ma_hang = inp.value.trim();
        const d = (AppState.cache.allData || []).find(x => x.ma_hang === line.ma_hang);
        if (d) { line.ten_hang_hoa = d.ten_hang_hoa; line.dvt = d.dvt; line.don_gia_thuc_te = d.don_gia; }
      }
      renderPoEditorOne();
    });

    $$('[data-rm]', $('#poEditOne')).forEach(b => b.onclick = () => { E.lines.splice(+b.dataset.rm, 1); renderPoEditorOne(); });
    $('#poEditAdd').onclick = () => { E.lines.push({ ma_hang:'', ten_hang_hoa:'', dvt:'', so_luong:1, don_gia_thuc_te:0, thanh_tien:0 }); renderPoEditorOne(); };
  }

  async function savePoEditor() {
    const E = AppState.cache.poEdit;

    // 1) Đọc & kiểm tra các trường đầu đơn
    const newMa = $('#pe_ma').value.trim();
    if (!newMa) return toast('Mã đơn không được để trống', 'error');

    // Nhà cung cấp: ưu tiên id đã chọn (ô ẩn), nếu không có thì khớp theo chữ đã gõ
    let nccObj = E.nccList.find(n => n.id_ncc === ($('#pe_ncc_id').value || '').trim());
    if (!nccObj) nccObj = matchNcc(E.nccList, $('#pe_ncc').value.trim());
    if (!nccObj) return toast('Nhà cung cấp không hợp lệ — hãy chọn từ danh sách gợi ý', 'error');

    // Công trình: tùy chọn — ưu tiên id đã chọn
    let ctObj = E.ctList.find(c => c.id_cong_trinh === ($('#pe_ct_id').value || '').trim());
    if (!ctObj && $('#pe_ct').value.trim()) {
      ctObj = matchCt(E.ctList, $('#pe_ct').value.trim());
      if (!ctObj) return toast('Công trình không hợp lệ — hãy chọn từ danh sách gợi ý', 'error');
    }

    // 2) Lọc dòng hợp lệ
    const lines = E.lines.filter(l => l.ten_hang_hoa && l.so_luong > 0);
    if (!lines.length) return toast('Đơn phải có ít nhất 1 dòng hợp lệ', 'error');
    lines.forEach(l => l.thanh_tien = l.so_luong * l.don_gia_thuc_te);
    const giaTri = lines.reduce((a, l) => a + l.thanh_tien, 0);

    // 3) Kiểm tra trùng mã đơn (nếu đổi mã)
    if (newMa !== E.ma_don_hang) {
      const all = await window.API.listDonHang();
      if (all.some(d => d.ma_don_hang === newMa && d.id_don_hang !== E.id_don_hang))
        return toast('Mã đơn đã tồn tại, hãy chọn mã khác', 'error');
    }

    // 4) Nếu đổi công trình -> cập nhật vào kế hoạch của đơn (nếu có kế hoạch)
    if (ctObj && E.id_ke_hoach) {
      const kh = await window.API.getKeHoach(E.id_ke_hoach);
      if (kh && kh.id_cong_trinh !== ctObj.id_cong_trinh) {
        kh.id_cong_trinh = ctObj.id_cong_trinh;
        await window.API.saveKeHoach(kh);
      }
    }

    // 5) Xóa các dòng chi tiết cũ không còn
    const keepIds = new Set(lines.filter(l => l.id_chi_tiet).map(l => l.id_chi_tiet));
    for (const c of E.origCt) if (!keepIds.has(c.id_chi_tiet)) await window.API._del(window.API._store.CHI_TIET, c.id_chi_tiet);

    // 6) Lưu các dòng hiện tại
    for (const l of lines) {
      await window.API.saveChiTiet({
        id_chi_tiet: l.id_chi_tiet, id_don_hang: E.id_don_hang,
        ma_hang: l.ma_hang || '(tùy chỉnh)', ten_hang_hoa: l.ten_hang_hoa,
        dvt: l.dvt || '', so_luong: l.so_luong,
        don_gia_de_xuat: l.don_gia_thuc_te, don_gia_thuc_te: l.don_gia_thuc_te,
        thanh_tien: l.thanh_tien, ghi_chu_dong: '',
      });
    }

    // 7) Cập nhật đơn hàng (mã, NCC, giá trị)
    const po = await window.API.getDonHang(E.id_don_hang);
    po.ma_don_hang = newMa;
    po.id_ncc = nccObj.id_ncc;
    po.gia_tri_don_hang = giaTri;
    await window.API.saveDonHang(po);

    closeModal(); toast('Đã lưu thay đổi đơn hàng', 'success'); renderDonHang();
  }

  // So khớp NCC từ chuỗi nhập (ưu tiên "NCCxxx - tên", sau đó theo mã, theo tên gần đúng)
  function matchNcc(list, raw) {
    if (!raw) return null;
    const code = raw.split(' - ')[0].trim().toUpperCase();
    let n = list.find(x => x.id_ncc.toUpperCase() === code);
    if (n) return n;
    const low = raw.toLowerCase();
    n = list.find(x => x.id_ncc.toLowerCase() === low || x.ten_ncc.toLowerCase() === low);
    if (n) return n;
    return list.find(x => x.ten_ncc.toLowerCase().includes(low)) || null;
  }
  // So khớp Công trình tương tự
  function matchCt(list, raw) {
    if (!raw) return null;
    const code = raw.split(' - ')[0].trim().toUpperCase();
    let c = list.find(x => (x.ma_cong_trinh || '').toUpperCase() === code);
    if (c) return c;
    const low = raw.toLowerCase();
    c = list.find(x => (x.ma_cong_trinh || '').toLowerCase() === low || (x.ten_cong_trinh || '').toLowerCase() === low);
    if (c) return c;
    return list.find(x => (x.ten_cong_trinh || '').toLowerCase().includes(low)) || null;
  }

  function confirmDelPO(id) {
    openModal({
      title: 'Xác nhận xóa đơn', body: '<p>Xóa đơn hàng (chỉ áp dụng khi chưa giao hàng)?</p>',
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Xóa', class: 'btn-danger', onClick: async () => {
          try { await window.API.deleteDonHang(id); toast('Đã xóa đơn', 'success'); closeModal(); renderDonHang(); }
          catch (e) { toast(e.message, 'error', 5000); }
        } },
      ],
    });
  }

  async function openPoDetail(id) {
    const po = await window.API.getDonHang(id);
    const cts = await window.API.listChiTietByDon(id);
    const cn = await window.API.congNoByDon(id);
    const next = C.PO_FLOW[po.trang_thai] || [];

    openModal({
      wide: true,
      title: 'Chi tiết đơn — ' + po.ma_don_hang,
      body: `
        <div class="detail-head">
          <div><small>Nhà cung cấp</small><b>${esc(po.id_ncc)}</b></div>
          <div><small>Trạng thái</small>${statusBadge(po.trang_thai)}</div>
          <div><small>Giá trị</small><b>${fmt(po.gia_tri_don_hang)}</b></div>
          <div><small>Công nợ</small><b class="${cn.remaining > 0 ? 'txt-danger' : 'txt-ok'}">${fmt(cn.remaining)}</b></div>
        </div>
        <table class="tbl sm"><thead><tr><th>Mã</th><th>Tên</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
          <tbody>${cts.map(c => `<tr><td>${esc(c.ma_hang)}</td><td>${esc(c.ten_hang_hoa)}</td>
            <td>${esc(c.dvt)}</td><td>${c.so_luong}</td><td>${fmt(c.don_gia_thuc_te)}</td><td>${fmt(c.thanh_tien)}</td></tr>`).join('')}</tbody></table>
        ${po.ghi_chu ? `<div class="alert sm">📝 ${esc(po.ghi_chu)}</div>` : ''}
        <div class="flow-box">
          <h4>Chuyển trạng thái</h4>
          <div class="flow-btns">
            ${next.length ? next.map(s => `<button class="btn ${s === C.PO_STATUS.DA_HUY ? 'btn-danger' : 'btn-primary'}" data-to="${esc(s)}">${esc(s)}</button>`).join('')
              : '<span class="muted">Đơn đã ở trạng thái cuối.</span>'}
          </div>
        </div>`,
      foot: [
        { label: 'Đóng', class: 'btn-light', onClick: closeModal },
        { label: '🖨️ In PDF', class: 'btn-light', onClick: () => printPO(id) },
      ],
    });


    $$('[data-to]', $('#modalBody')).forEach(b => b.onclick = async () => {
      const to = b.dataset.to;
      if (to === C.PO_STATUS.DA_HUY) {
        openModal({
          title: 'Hủy đơn — nhập lý do',
          body: `<label>Lý do hủy *<textarea id="cancelReason"></textarea></label>`,
          foot: [
            { label: 'Quay lại', class: 'btn-light', onClick: () => openPoDetail(id) },
            { label: 'Xác nhận hủy', class: 'btn-danger', onClick: async () => {
              const r = $('#cancelReason').value.trim();
              if (!r) return toast('Bắt buộc nhập lý do', 'error');
              try { await window.API.changePoStatus(id, to, 'Hủy: ' + r); toast('Đã hủy đơn', 'success'); closeModal(); renderDonHang(); }
              catch (e) { toast(e.message, 'error'); }
            } },
          ],
        });
      } else {
        try { await window.API.changePoStatus(id, to); toast('Đã chuyển: ' + to, 'success'); openPoDetail(id); }
        catch (e) { toast(e.message, 'error', 5000); }
      }
    });
  }

  /* -------------------- IN PDF (window.print + @media print) -------------------- */
  async function printPO(id) {
    const po = await window.API.getDonHang(id);
    const cts = await window.API.listChiTietByDon(id);
    const ncc = (await window.API.listNCC()).find(n => n.id_ncc === po.id_ncc) || {};
    const kh = await window.API.getKeHoach(po.id_ke_hoach);
    const ct = kh ? await window.API.getCongTrinh(kh.id_cong_trinh) : null;

    $('#printArea').innerHTML = `
      <div class="print-doc">
        <div class="print-title">ĐƠN ĐẶT HÀNG</div>
        <div class="print-sub">Số: ${esc(po.ma_don_hang)} — Ngày: ${esc((po.ngay_tao || '').slice(0, 10))}</div>
        <div class="print-meta">
          <div><b>Nhà cung cấp:</b> ${esc(ncc.ten_ncc || po.id_ncc)}<br>
            <b>Điện thoại:</b> ${esc(ncc.dien_thoai || '')}<br>
            <b>Địa chỉ:</b> ${esc(ncc.dia_chi || '')}</div>
          <div><b>Công trình:</b> ${esc(ct ? ct.ten_cong_trinh : '')}<br>
            <b>Địa điểm:</b> ${esc(ct ? ct.dia_diem : '')}<br>
            <b>Kế hoạch tháng:</b> ${esc(kh ? kh.thang_nam : '')}</div>
        </div>
        <table class="print-tbl">
          <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng hóa</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
          <tbody>${cts.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.ma_hang)}</td><td style="text-align:left">${esc(c.ten_hang_hoa)}</td>
            <td>${esc(c.dvt)}</td><td>${c.so_luong}</td><td>${fmt(c.don_gia_thuc_te)}</td><td>${fmt(c.thanh_tien)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="6" style="text-align:right"><b>TỔNG CỘNG</b></td><td><b>${fmt(po.gia_tri_don_hang)}</b></td></tr></tfoot>
        </table>
        <div class="print-sign"><div>Người lập đơn</div><div>Nhà cung cấp xác nhận</div></div>
      </div>`;
    document.body.classList.add('printing');
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 500);
  }

  /* -------------------- XUẤT EXCEL 1 ĐƠN — kẻ khung, vừa A4 (Debug 4) -------------------- */
  async function exportPoExcel(id) {
    const po = await window.API.getDonHang(id);
    const cts = await window.API.listChiTietByDon(id);
    const ncc = (await window.API.listNCC()).find(n => n.id_ncc === po.id_ncc) || {};
    const kh = po.id_ke_hoach ? await window.API.getKeHoach(po.id_ke_hoach) : null;
    const ct = kh ? await window.API.getCongTrinh(kh.id_cong_trinh) : null;

    const wb = XLSX.utils.book_new();
    const ws = buildPoSheet(po, cts, ncc, ct, kh, 0);
    setA4(ws);
    XLSX.utils.book_append_sheet(wb, ws, 'DonHang');
    XLSX.writeFile(wb, `${po.ma_don_hang}.xlsx`);
    toast('Đã xuất Excel (kẻ khung, vừa A4)', 'success');
  }

  // Dựng 1 sheet đơn hàng theo bố cục PDF. startRow = dòng bắt đầu (cho phép nối nhiều đơn 1 sheet)
  // Trả về { ws, nextRow } khi gọi cho gộp; khi gọi lẻ trả về ws.
  function buildPoSheet(po, cts, ncc, ct, kh, startRow) {
    const NC = 7; // 7 cột: STT,Mã,Tên,ĐVT,SL,Đơn giá,Thành tiền
    const aoa = [];
    aoa.push(['ĐƠN ĐẶT HÀNG', '', '', '', '', '', '']);
    aoa.push([`Số: ${po.ma_don_hang}    Ngày: ${(po.ngay_tao||'').slice(0,10)}`, '', '', '', '', '', '']);
    aoa.push([`Nhà cung cấp: ${ncc.ten_ncc || po.id_ncc}`, '', '', '', `Công trình: ${ct ? ct.ten_cong_trinh : ''}`, '', '']);
    aoa.push([`Điện thoại: ${ncc.dien_thoai || ''}`, '', '', '', `Kế hoạch tháng: ${kh ? kh.thang_nam : ''}`, '', '']);
    aoa.push(['STT', 'Mã hàng', 'Tên hàng hóa', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền']);
    cts.forEach((c, i) => aoa.push([i+1, c.ma_hang, c.ten_hang_hoa, c.dvt, c.so_luong, c.don_gia_thuc_te, c.thanh_tien]));
    aoa.push(['', '', '', '', '', 'TỔNG CỘNG', po.gia_tri_don_hang]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:5},{wch:14},{wch:40},{wch:8},{wch:8},{wch:14},{wch:16}];
    // merge tiêu đề & dòng phụ
    ws['!merges'] = [
      { s:{r:0,c:0}, e:{r:0,c:NC-1} },
      { s:{r:1,c:0}, e:{r:1,c:NC-1} },
      { s:{r:2,c:0}, e:{r:2,c:3} }, { s:{r:2,c:4}, e:{r:2,c:NC-1} },
      { s:{r:3,c:0}, e:{r:3,c:3} }, { s:{r:3,c:4}, e:{r:3,c:NC-1} },
    ];
    const headRow = 4, firstData = 5, lastData = 4 + cts.length, totalRow = lastData + 1;
    // style
    styleRange(ws, 0, 0, 0, NC-1, () => XL.title());
    styleRange(ws, 1, 1, 0, NC-1, () => XL.sub());
    styleRange(ws, headRow, headRow, 0, NC-1, () => XL.head());
    styleRange(ws, firstData, lastData, 0, NC-1, (r,c) =>
      c===0 ? XL.cell('center') : c===2 ? XL.cell('left') : (c>=4 ? (c===4?XL.cell('center'):XL.money()) : XL.cell('center')));
    styleRange(ws, totalRow, totalRow, 0, NC-1, () => XL.total());
    ws['!ref'] = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:totalRow,c:NC-1} });
    return ws;
  }

    /* ====================================================================
   *  DEBUG 4 — STYLE EXCEL (xlsx-js-style): kẻ khung, canh lề, vừa A4
   * ==================================================================== */
  const XL = {
    thin: { style: 'thin', color: { rgb: '000000' } },
    border() { return { top: this.thin, bottom: this.thin, left: this.thin, right: this.thin }; },
    title()  { return { font: { bold: true, sz: 15 }, alignment: { horizontal: 'center', vertical: 'center' } }; },
    sub()    { return { font: { italic: true, sz: 10 }, alignment: { horizontal: 'center' } }; },
    head()   { return { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2563EB' } },
                        alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: this.border() }; },
    cell(al) { return { font: { sz: 10 }, alignment: { horizontal: al || 'left', vertical: 'center', wrapText: true }, border: this.border() }; },
    money()  { return { font: { sz: 10 }, alignment: { horizontal: 'right', vertical: 'center' }, border: this.border(), numFmt: '#,##0' }; },
    total()  { return { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: 'FEF3C7' } }, alignment: { horizontal: 'right' }, border: this.border(), numFmt: '#,##0' }; },
  };
  // Áp style cho mọi ô trong vùng [r0..r1]x[c0..c1] theo callback (r,c)->style
  function styleRange(ws, r0, r1, c0, c1, styler) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = styler(r, c);
    }
  }
  // Cấu hình in vừa khổ A4 dọc (fit 1 trang ngang)
  function setA4(ws) {
    ws['!pageSetup'] = { orientation: 'portrait', paperSize: 9, scale: 0, fitToWidth: 1, fitToHeight: 0 };
    ws['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  }

  /* ====================================================================
   *  MÀN HÌNH 5 — THANH TOÁN & CÔNG NỢ
   * ==================================================================== */
  async function renderThanhToan() {
    const dhs = (await window.API.listDonHang())
      .filter(d => [C.PO_STATUS.DA_XUAT_HD, C.PO_STATUS.TT_MOT_PHAN, C.PO_STATUS.DA_THANH_TOAN, C.PO_STATUS.DA_GIAO].includes(d.trang_thai));
    if (!dhs.length) { view().innerHTML = emptyBox('Chưa có đơn nào ở giai đoạn thanh toán (cần ≥ "Đã giao hàng").'); return; }

    const rows = [];
    for (const d of dhs) { const cn = await window.API.congNoByDon(d.id_don_hang); rows.push({ d, cn }); }
    const totalDebt = rows.reduce((a, r) => a + r.cn.remaining, 0);

    view().innerHTML = `
      ${card(`<div class="mini-stat"><span>Tổng công nợ còn phải trả</span><strong class="txt-danger">${fmt(totalDebt)}</strong></div>`)}
      ${card(`<table class="tbl"><thead><tr>
        <th>Mã đơn</th><th>NCC</th><th>Giá trị</th><th>Đã trả</th><th>Còn lại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>${rows.map(({ d, cn }) => `<tr>
          <td><b>${esc(d.ma_don_hang)}</b></td><td>${esc(d.id_ncc)}</td>
          <td>${fmt(cn.gia_tri)}</td><td>${fmt(cn.paid)}</td>
          <td class="${cn.remaining > 0 ? 'txt-danger' : 'txt-ok'}">${fmt(cn.remaining)}</td>
          <td>${statusBadge(d.trang_thai)}</td>
          <td class="act"><button class="ibtn ibtn-primary" data-pay="${d.id_don_hang}" title="Ghi nhận thanh toán">💵</button>
            <button class="ibtn" data-hist="${d.id_don_hang}" title="Lịch sử">📜</button></td>
        </tr>`).join('')}</tbody></table>`)}`;


    $$('[data-pay]', view()).forEach(b => b.onclick = () => payForm(b.dataset.pay));

    $$('[data-hist]', view()).forEach(b => b.onclick = () => payHistory(b.dataset.hist));
  }

  async function payForm(id) {
    const cn = await window.API.congNoByDon(id);
    if (cn.remaining <= 0) return toast('Đơn đã thanh toán đủ', 'info');
    openModal({
      title: 'Ghi nhận thanh toán',
      body: `<div class="alert sm">Còn lại: <b>${fmt(cn.remaining)}</b></div>
        <div class="form-grid">
          <label>Số hóa đơn VAT<input id="p_hd"></label>
          <label>Ngày hóa đơn<input id="p_nhd" type="date" value="${window.API.todayStr()}"></label>
          <label>Số tiền (₫) *<input id="p_tien" type="number" min="0" max="${cn.remaining}" value="${cn.remaining}"></label>
          <label>Ngày thanh toán<input id="p_ntt" type="date" value="${window.API.todayStr()}"></label>
          <label>Hình thức<select id="p_ht"><option>Chuyển khoản</option><option>Tiền mặt</option></select></label>
          <label>Người duyệt<input id="p_nguoi"></label>
          <label class="col-2">Ghi chú<input id="p_gc"></label>
        </div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Lưu thanh toán', class: 'btn-primary', onClick: async () => {
          const tien = Number($('#p_tien').value);
          if (!tien || tien <= 0) return toast('Nhập số tiền hợp lệ', 'error');
          if (tien > cn.remaining) return toast('Số tiền vượt quá công nợ còn lại', 'error');
          await window.API.saveThanhToan({
            id_don_hang: id, so_hoa_don_ncc: $('#p_hd').value.trim(),
            ngay_xuat_hoa_don: $('#p_nhd').value, so_tien_thanh_toan: tien,
            ngay_thanh_toan: $('#p_ntt').value, hinh_thuc_thanh_toan: $('#p_ht').value,
            nguoi_duyet_thanh_toan: $('#p_nguoi').value.trim(), ghi_chu: $('#p_gc').value.trim(),
          });
          closeModal(); toast('Đã ghi nhận thanh toán', 'success'); renderThanhToan();
        } },
      ],
    });
  }

  async function payHistory(id) {
    const list = await window.API.listThanhToanByDon(id);
    const po = await window.API.getDonHang(id);
    openModal({
      title: 'Lịch sử thanh toán — ' + po.ma_don_hang,
      body: list.length ? `<table class="tbl sm"><thead><tr><th>Ngày TT</th><th>Số HĐ</th><th>Số tiền</th><th>Hình thức</th><th>Người duyệt</th></tr></thead>
        <tbody>${list.map(t => `<tr><td>${esc(t.ngay_thanh_toan)}</td><td>${esc(t.so_hoa_don_ncc || '')}</td>
          <td>${fmt(t.so_tien_thanh_toan)}</td><td>${esc(t.hinh_thuc_thanh_toan)}</td><td>${esc(t.nguoi_duyet_thanh_toan || '')}</td></tr>`).join('')}</tbody></table>`
        : emptyBox('Chưa có giao dịch.'),
      foot: [{ label: 'Đóng', class: 'btn-light', onClick: closeModal }],
    });
  }

  /* ====================================================================
   *  MÀN HÌNH 6 — DANH MỤC VẬT TƯ
   * ==================================================================== */
  async function renderDanhMuc() {
    toolbarBtn('Xuất Excel danh mục', 'btn-light', exportDataExcel, '📊');
    const [data, nhoms] = await Promise.all([window.API.listData(), window.API.listNhom()]);
    AppState.cache.dmData = data;
    view().innerHTML = `
      <div class="filter-bar">
        <input id="dmSearch" placeholder="🔍 Tìm tên / mã hàng…">
        <select id="dmNhom"><option value="">— Tất cả nhóm —</option>
          ${nhoms.map(n => `<option value="${n.id_nhom}">${esc(n.ten_nhom)}</option>`).join('')}</select>
        <span class="muted" id="dmCount"></span>
      </div>
      <div id="dmWrap"></div>`;
    const draw = () => {
      const q = $('#dmSearch').value.trim().toLowerCase(), fn = $('#dmNhom').value;
      const rows = data.filter(it => (!q || `${it.ten_hang_hoa} ${it.ma_hang}`.toLowerCase().includes(q)) && (!fn || it.id_nhom === fn)).slice(0, 200);
      $('#dmCount').textContent = `${rows.length} mặt hàng`;
      $('#dmWrap').innerHTML = card(`<table class="tbl"><thead><tr>
        <th>Mã</th><th>Tên hàng hóa</th><th>ĐVT</th><th>Đơn giá</th><th>Nhóm</th><th>NCC</th><th>Chu kỳ</th><th>Hư hỏng</th></tr></thead>
        <tbody>${rows.map(it => `<tr><td><b>${esc(it.ma_hang)}</b></td><td>${esc(it.ten_hang_hoa)}</td>
          <td>${esc(it.dvt)}</td><td>${fmt(it.don_gia)}</td><td>${esc(it.phan_loai_nhom_hang)}</td>
          <td>${esc(C.GROUP_TO_NCC[it.ma_nhom])}</td><td>${esc(it.chu_ky_thay_the)}</td>
          <td>${it.muc_do_hu_hong === 'Dễ hư hỏng' ? '<span class="badge badge-amber">Dễ hư hỏng</span>' : esc(it.muc_do_hu_hong)}</td></tr>`).join('')}</tbody></table>`);
    };
    $('#dmSearch').oninput = draw; $('#dmNhom').onchange = draw; draw();
  }

  async function exportDataExcel() {
    const data = AppState.cache.dmData || await window.API.listData();
    const header = ['STT','Mã hàng','Tên hàng hóa','ĐVT','Đơn giá','Giá thị trường','Nhóm','NCC','Mục đích','Mức độ hư hỏng','Chu kỳ thay thế','Phân loại chi phí'];
    const aoa = [header, ...data.map((it, i) => [i+1, it.ma_hang, it.ten_hang_hoa, it.dvt, it.don_gia, it.gia_thi_truong,
      it.phan_loai_nhom_hang, C.GROUP_TO_NCC[it.ma_nhom], it.muc_dich_su_dung, it.muc_do_hu_hong, it.chu_ky_thay_the, it.phan_loai_chi_phi])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = header.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'DanhMuc');
    const rng = XLSX.utils.decode_range(ws['!ref']);
    styleRange(ws, 0, 0, 0, rng.e.c, () => XL.head());
    styleRange(ws, 1, rng.e.r, 0, rng.e.c, (r,c)=> [4].includes(c) ? XL.money() : XL.cell('left'));
    setA4(ws);
    XLSX.writeFile(wb, 'DanhMuc_VatTu.xlsx'); toast('Đã xuất Excel danh mục', 'success');
  }

  /* ====================================================================
   *  MÀN HÌNH 7 — NHÀ CUNG CẤP
   * ==================================================================== */
  async function renderNCC() {
    toolbarBtn('Thêm nhà cung cấp', 'btn-primary', () => nccForm(), '➕');
    const [nccs, dhs] = await Promise.all([window.API.listNCC(), window.API.listDonHang()]);
    const active = dhs.filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
    view().innerHTML = `<div class="ncc-grid">${nccs.map(n => {
      const po = active.filter(d => d.id_ncc === n.id_ncc);
      const total = po.reduce((a, b) => a + b.gia_tri_don_hang, 0);
      return `<div class="card ncc-card">
        <div class="ncc-head"><span><b>${esc(n.id_ncc)}</b> ${esc(n.ten_ncc)}</span>
          <span class="act"><button class="ibtn" data-edit="${n.id_ncc}" title="Sửa">✏️</button>
          <button class="ibtn ibtn-danger" data-del="${n.id_ncc}" title="Xóa">🗑️</button></span></div>
        <div class="ncc-body">
          <div class="mini-stat"><span>Nhóm phụ trách</span><strong>${(n.nhom_phu_trach||[]).join(', ')}</strong></div>
          <div class="mini-stat"><span>Số đơn hàng</span><strong>${po.length}</strong></div>
          <div class="mini-stat"><span>Tổng giá trị</span><strong>${fmt(total)}</strong></div>
          <div class="mini-stat"><span>Điện thoại</span><strong>${esc(n.dien_thoai || '')}</strong></div>
          <small>${esc(n.dia_chi || '')}</small>
        </div></div>`;
    }).join('') || emptyBox('Chưa có nhà cung cấp.')}</div>`;


    $$('[data-edit]', view()).forEach(b => b.onclick = async () => {
      const n = (await window.API.listNCC()).find(x => x.id_ncc === b.dataset.edit); nccForm(n);
    });

    $$('[data-del]', view()).forEach(b => b.onclick = () => openModal({
      title: 'Xác nhận xóa', body: `<p>Xóa nhà cung cấp <b>${esc(b.dataset.del)}</b>?</p>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Xóa', class: 'btn-danger', onClick: async () => {
          try { await window.API.deleteNCC(b.dataset.del); closeModal(); toast('Đã xóa NCC', 'success'); renderNCC(); }
          catch (e) { toast(e.message, 'error', 5000); }
        } },
      ],
    }));
  }

  /* ====================================================================
   *  MÀN HÌNH 8 — BÁO CÁO (Excel nhiều sheet)
   * ==================================================================== */
  async function renderBaoCao() {
    toolbarBtn('Xuất báo cáo Excel', 'btn-primary', exportFullReport, '📊');
    const [dhs, khs, cts, nccs] = await Promise.all([
      window.API.listDonHang(), window.API.listKeHoach(), window.API.listCongTrinh(), window.API.listNCC(),
    ]);
    const active = dhs.filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);

    // Theo NCC
    const nccRows = [];
    for (const n of nccs) {
      const po = active.filter(d => d.id_ncc === n.id_ncc);
      let paid = 0; for (const d of po) paid += (await window.API.congNoByDon(d.id_don_hang)).paid;
      const total = po.reduce((a, b) => a + b.gia_tri_don_hang, 0);
      nccRows.push({ n, count: po.length, total, paid, debt: total - paid });
    }
    // Theo công trình
    const ctMap = Object.fromEntries(cts.map(c => [c.id_cong_trinh, c]));
    const ctAgg = {};
    for (const k of khs) {
      const po = active.filter(d => d.id_ke_hoach === k.id_ke_hoach);
      const spent = po.reduce((a, b) => a + b.gia_tri_don_hang, 0);
      const key = k.id_cong_trinh;
      ctAgg[key] = ctAgg[key] || { budget: 0, spent: 0, plans: 0 };
      ctAgg[key].budget += k.tong_du_tru; ctAgg[key].spent += spent; ctAgg[key].plans++;
    }
    AppState.cache.report = { nccRows, ctAgg, ctMap };

    view().innerHTML = `
      ${card(`<h3>Chi phí theo Nhà cung cấp</h3>
        <table class="tbl"><thead><tr><th>NCC</th><th>Tên</th><th>Số đơn</th><th>Tổng</th><th>Đã trả</th><th>Công nợ</th></tr></thead>
        <tbody>${nccRows.map(r => `<tr><td><b>${esc(r.n.id_ncc)}</b></td><td>${esc(r.n.ten_ncc)}</td>
          <td>${r.count}</td><td>${fmt(r.total)}</td><td>${fmt(r.paid)}</td>
          <td class="${r.debt > 0 ? 'txt-danger' : 'txt-ok'}">${fmt(r.debt)}</td></tr>`).join('')}</tbody></table>`)}
      ${card(`<h3>Chi phí theo Công trình</h3>
        <table class="tbl"><thead><tr><th>Mã CT</th><th>Tên</th><th>Số KH</th><th>Ngân sách</th><th>Đã chi</th><th>Còn lại</th><th>% SD</th></tr></thead>
        <tbody>${Object.entries(ctAgg).map(([id, a]) => { const c = ctMap[id]; const pct = a.budget ? a.spent / a.budget * 100 : 0;
          return `<tr><td><b>${esc(c ? c.ma_cong_trinh : id)}</b></td><td>${esc(c ? c.ten_cong_trinh : '')}</td>
            <td>${a.plans}</td><td>${fmt(a.budget)}</td><td>${fmt(a.spent)}</td>
            <td>${fmt(a.budget - a.spent)}</td><td>${pct.toFixed(0)}%</td></tr>`; }).join('') || '<tr><td colspan="7">Chưa có dữ liệu</td></tr>'}</tbody></table>`)}`;
  }

  async function exportFullReport() {
    const r = AppState.cache.report; if (!r) return;
    const wb = XLSX.utils.book_new();
    const wsNcc = XLSX.utils.aoa_to_sheet([C.EXCEL_COLS.REPORT_NCC,
      ...r.nccRows.map((x, i) => [i + 1, x.n.id_ncc, x.n.ten_ncc, x.count, x.total, x.paid, x.debt])]);
    XLSX.utils.book_append_sheet(wb, wsNcc, 'TheoNCC');
    const wsCt = XLSX.utils.aoa_to_sheet([C.EXCEL_COLS.REPORT_CT,
      ...Object.entries(r.ctAgg).map(([id, a], i) => { const c = r.ctMap[id]; const pct = a.budget ? (a.spent / a.budget * 100).toFixed(0) + '%' : '0%';
        return [i + 1, c ? c.ma_cong_trinh : id, c ? c.ten_cong_trinh : '', a.plans, a.budget, a.spent, a.budget - a.spent, pct]; })]);
    XLSX.utils.book_append_sheet(wb, wsCt, 'TheoCongTrinh');
    const rng = XLSX.utils.decode_range(ws['!ref']);
    styleRange(ws, 0, 0, 0, rng.e.c, () => XL.head());
    styleRange(ws, 1, rng.e.r, 0, rng.e.c, (r,c)=> [4].includes(c) ? XL.money() : XL.cell('left'));
    setA4(ws);
    XLSX.writeFile(wb, 'BaoCao_MuaSam.xlsx'); toast('Đã xuất báo cáo Excel', 'success');
  }

  /* ====================================================================
   *  MÀN HÌNH 9 — CÀI ĐẶT & SAO LƯU
   * ==================================================================== */
  async function renderCaiDat() {
    const gKey = await window.API.getSetting('gemini_key') || '';
    const nKey = await window.API.getSetting('nvidia_key') || '';
    const ai = await window.API.aiStatus();
    view().innerHTML = `
      ${card(`<h3>🤖 Tích hợp AI (tùy chọn)</h3>
        <p class="muted">Để trống = dùng thuật toán nội bộ (miễn phí, chạy offline). Nhập key để bật AI đám mây. Hiện tại: <b>${ai.mode}</b>.</p>
        <div class="form-grid">
          <label class="col-2">Google Gemini API Key (gợi ý thay thế)
            <input id="set_gemini" type="password" value="${esc(gKey)}" placeholder="AIza…"></label>
          <label class="col-2">NVIDIA NIM API Key (tối ưu phân bổ PO)
            <input id="set_nvidia" type="password" value="${esc(nKey)}" placeholder="nvapi-…"></label>
        </div>
        <button class="btn btn-primary" id="btnSaveKeys">Lưu khóa AI</button>`)}
      ${card(`<h3>💾 Sao lưu / Phục hồi (R-04)</h3>
        <p class="muted">Xuất toàn bộ dữ liệu IndexedDB ra file JSON để phòng mất dữ liệu khi xóa cache trình duyệt.</p>
        <div class="btn-row">
          <button class="btn btn-primary" id="btnBackup">⬇️ Sao lưu (.json)</button>
          <label class="btn btn-light">⬆️ Phục hồi từ file<input id="fileRestore" type="file" accept=".json" hidden></label>
        </div>`)}
      ${card(`<h3>📥 Nhập danh mục từ Excel/JSON</h3>
        <p class="muted">Nạp file danh mục (đúng cấu trúc cột bên dưới). Sẽ thay thế danh mục hiện tại.</p>
        <div class="btn-row">
          <button class="btn btn-light" id="btnTemplate">⬇️ Tải file template mẫu (.xlsx)</button>
          <label class="btn btn-warn">📁 Chọn file Excel/JSON để nhập<input id="fileImport" type="file" accept=".xlsx,.xls,.json" hidden></label>
        </div>
        <p class="muted" style="margin-top:8px">Cột bắt buộc: <b>ma_hang, ten_hang_hoa, dvt, don_gia, gia_thi_truong, phan_loai_nhom_hang, id_nhom, ma_nhom, nha_cung_cap, muc_dich_su_dung, muc_do_hu_hong, chu_ky_thay_the, phan_loai_chi_phi</b>. Cột <b>muc_do_hu_hong</b> nhận: "Dễ hư hỏng" / "Trung bình" / "Bền". Cột <b>chu_ky_thay_the</b> ghi dạng "từ 3 đến 6 tháng" hoặc "1 tháng".</p>`)}
      ${card(`<h3>⚠️ Xóa & khởi tạo lại dữ liệu mẫu</h3>
        <button class="btn btn-danger" id="btnReset">Xóa toàn bộ & nạp 300 mẫu</button>`)}`;

    $('#btnSaveKeys').onclick = async () => {
      await window.API.setSetting('gemini_key', $('#set_gemini').value.trim());
      await window.API.setSetting('nvidia_key', $('#set_nvidia').value.trim());
      const s = await window.API.aiStatus(); $('#aiStatusPill').textContent = 'TanDigitalAI: ' + s.mode;
      toast('Đã lưu khóa AI', 'success');
    };
    $('#btnBackup').onclick = async () => {
      const dump = await window.API.exportBackup();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `backup_qlms_${window.API.todayStr()}.json`; a.click();
      toast('Đã tạo file sao lưu', 'success');
    };
    $('#fileRestore').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => {
        try { await window.API.importBackup(JSON.parse(rd.result)); toast('Đã phục hồi dữ liệu', 'success'); navigate('dashboard'); }
        catch (err) { toast('File không hợp lệ: ' + err.message, 'error', 5000); }
      };
      rd.readAsText(f);
    };
    $('#fileImport').onchange = (e) => importCatalog(e.target.files[0]);
    $('#btnTemplate').onclick = () => downloadCatalogTemplate();
    $('#btnReset').onclick = () => openModal({
      title: 'Xác nhận', body: '<p>Xóa TOÀN BỘ dữ liệu và nạp lại 300 mặt hàng mẫu?</p>',
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Xóa & nạp lại', class: 'btn-danger', onClick: async () => {
          for (const st of Object.values(window.API._store)) await window.API._clear(st);
          await window.API.seedIfEmpty(); closeModal(); toast('Đã khởi tạo lại', 'success'); navigate('dashboard');
        } },
      ],
    });
  }

  // Nhập danh mục từ Excel (SheetJS) hoặc JSON
  function importCatalog(file) {
    if (!file) return;
    const rd = new FileReader();
    const finish = async (rows) => {
      const enriched = rows.map(r => window.API.enrichItem({
        stt: r.stt, ma_hang: String(r.ma_hang), ten_hang_hoa: r.ten_hang_hoa, dvt: r.dvt,
        don_gia: Number(r.don_gia) || 0, gia_thi_truong: String(r.gia_thi_truong || ''),
        phan_loai_nhom_hang: r.phan_loai_nhom_hang, id_nhom: r.id_nhom, ma_nhom: r.ma_nhom,
        nha_cung_cap: r.nha_cung_cap, muc_dich_su_dung: r.muc_dich_su_dung,
        muc_do_hu_hong: r.muc_do_hu_hong, chu_ky_thay_the: String(r.chu_ky_thay_the || ''),
        phan_loai_chi_phi: r.phan_loai_chi_phi,
      }));
      await window.API._clear(window.API._store.DATA);
      await window.API._bulkPut(window.API._store.DATA, enriched);
      toast(`Đã nhập ${enriched.length} mặt hàng`, 'success'); navigate('danhmuc');
    };
    if (file.name.endsWith('.json')) {
      rd.onload = () => { try { finish(JSON.parse(rd.result)); } catch (e) { toast('JSON lỗi: ' + e.message, 'error'); } };
      rd.readAsText(file);
    } else {
      rd.onload = () => {
        const wb = XLSX.read(rd.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        finish(XLSX.utils.sheet_to_json(ws, { defval: '' }));
      };
      rd.readAsArrayBuffer(file);
    }
  }

    // Tải file Excel template mẫu cho danh mục vật tư
  function downloadCatalogTemplate() {
    const header = ['ma_hang','ten_hang_hoa','dvt','don_gia','gia_thi_truong','phan_loai_nhom_hang','id_nhom','ma_nhom','nha_cung_cap','muc_dich_su_dung','muc_do_hu_hong','chu_ky_thay_the','phan_loai_chi_phi'];
    const sample = [
      ['CDM-001','Máy bơm chìm 3HP','Cái',12500000,'11000000 - 16000000','Cơ điện - Máy móc','NH01','CDM','NCC001','Bơm hút nước thải','Trung bình','từ 12 đến 18 tháng','Chi phí thiết bị'],
      ['CDM-002','Tụ điện khởi động 50µF','Cái',95000,'80000 - 130000','Cơ điện - Máy móc','NH01','CDM','NCC001','Khởi động mô tơ','Dễ hư hỏng','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['BHL-001','Găng tay cao su','Đôi',25000,'20000 - 35000','Bảo hộ lao động','NH05','BHL','NCC005','Bảo hộ tay','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, ...sample]);
    ws['!cols'] = header.map(h => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_DanhMuc_VatTu.xlsx');
    toast('Đã tải file template mẫu', 'success');
  }

  /* ====================================================================
   *  TẠO ĐƠN HÀNG LOẠT (Auto-Generate) — chọn kế hoạch + cấu hình
   * ==================================================================== */
  async function openAutoGenerate() {
    const khs = await window.API.listKeHoach();
    if (!khs.length) return toast('Hãy lập Kế hoạch trước', 'error');
    const cts = await window.API.listCongTrinh();
    const ctMap = Object.fromEntries(cts.map(c => [c.id_cong_trinh, c]));
    const nccs = await window.API.listNCC();
    const nhoms = await window.API.listNhom();
    const ai = await window.API.aiStatus();

    openModal({
      title: '⚡ Tạo đơn hàng tự động hàng loạt',
      body: `
        <div class="form-grid">
          <label class="col-2">Kế hoạch áp dụng *
            <select id="ag_kh">${khs.map(k => `<option value="${k.id_ke_hoach}">${esc(k.thang_nam)} — ${esc(ctMap[k.id_cong_trinh]?.ten_cong_trinh || '')} (NS: ${fmt(k.tong_du_tru)})</option>`).join('')}</select>
          </label>
          <label>Giá trị tối thiểu / đơn (₫)<input id="ag_min" type="number" value="${C.ORDER_CONSTRAINTS.MIN_ORDER}"></label>
          <label>Giá trị tối đa / đơn (₫)<input id="ag_max" type="number" value="${C.ORDER_CONSTRAINTS.MAX_ORDER}"></label>
          <label class="col-2">Giới hạn NCC (bỏ trống = tất cả)
            <div class="multi-dd" id="dd_ncc">
              <button type="button" class="multi-dd-btn" id="ddbtn_ncc">— Tất cả NCC —</button>
              <div class="multi-dd-panel" id="ddpanel_ncc" hidden>
                ${nccs.map(n => `<label class="dd-item"><input type="checkbox" value="${n.id_ncc}"> <span>${esc(n.id_ncc)} - ${esc(n.ten_ncc)}</span></label>`).join('')}
              </div>
            </div>
          </label>
          <label class="col-2">Giới hạn nhóm (bỏ trống = tất cả)
            <div class="multi-dd" id="dd_nhom">
              <button type="button" class="multi-dd-btn" id="ddbtn_nhom">— Tất cả nhóm —</button>
              <div class="multi-dd-panel" id="ddpanel_nhom" hidden>
                ${nhoms.map(n => `<label class="dd-item"><input type="checkbox" value="${n.id_nhom}"> <span>${esc(n.ten_nhom)}</span></label>`).join('')}
              </div>
            </div>
          </label>
          <label class="col-2"><input type="checkbox" id="ag_dehu" style="width:auto"> Chỉ chọn vật tư "Dễ hư hỏng"</label>
          <label class="col-2">Mức lấp đầy mỗi đơn: <b id="ag_fr_lbl">92%</b>
            <input type="range" id="ag_fr" min="60" max="100" value="92" oninput="document.getElementById('ag_fr_lbl').textContent=this.value+'%'"></label>
        </div>
        <div class="alert sm">Hệ thống sẽ tự chọn vật tư, cân số lượng nguyên dương, và tách thành nhiều đơn sao cho mỗi đơn nằm trong [min, max] và tổng ≤ ngân sách kế hoạch.</div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: '🧮 Bằng thuật toán', class: 'btn-primary', onClick: () => runAutoGenerate(false) },
        { label: ai.nvidia ? '🤖 Bằng AI (NVIDIA)' : '🤖 AI (cần key)', class: 'btn-warn', onClick: () => runAutoGenerate(true) },
      ],
    });
    // Điều khiển 2 dropdown tick chọn nhiều
    setupMultiDropdown('dd_ncc', 'ddbtn_ncc', 'ddpanel_ncc', '— Tất cả NCC —', 'NCC');
    setupMultiDropdown('dd_nhom', 'ddbtn_nhom', 'ddpanel_nhom', '— Tất cả nhóm —', 'nhóm');
  }

  // Dropdown tick chọn nhiều — cập nhật nhãn nút theo số lượng đã chọn
  function setupMultiDropdown(ddId, btnId, panelId, allLabel, unit) {
    const dd = document.getElementById(ddId);
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (!btn || !panel) return;
    const sync = () => {
      const n = panel.querySelectorAll('input:checked').length;
      btn.textContent = n === 0 ? allLabel : `Đã chọn ${n} ${unit}`;
      btn.classList.toggle('has-sel', n > 0);
    };
    btn.onclick = (e) => { e.preventDefault(); panel.hidden = !panel.hidden; };
    panel.querySelectorAll('input').forEach(i => i.onchange = sync);
    // bấm ra ngoài thì đóng
    document.addEventListener('click', (e) => { if (dd && !dd.contains(e.target)) panel.hidden = true; });
    sync();
  }

  async function runAutoGenerate(useAI) {
    const idkh = $('#ag_kh').value;
    const kh = await window.API.getKeHoach(idkh);
    const minOrder = Number($('#ag_min').value), maxOrder = Number($('#ag_max').value);
    if (minOrder <= 0 || maxOrder <= minOrder) return toast('Min/Max không hợp lệ', 'error');

    // ngân sách còn lại của kế hoạch (trừ PO cũ)
    const existPOs = (await window.API.listDonHangByKeHoach(idkh)).filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
    const used = existPOs.reduce((a, b) => a + b.gia_tri_don_hang, 0);
    const budget = kh.tong_du_tru - used;
    if (budget < minOrder) return toast(`Ngân sách còn lại ${fmt(budget)} không đủ tạo đơn`, 'error', 5000);

    const pickChk = (panelId) => $$(`#${panelId} input:checked`, $('#modalBody')).map(i => i.value);
    const params = {
      thang_nam: kh.thang_nam, budget, minOrder, maxOrder,
      opts: {
        id_ncc:  pickChk('ddpanel_ncc'),   // mảng [] (Debug 1)
        id_nhom: pickChk('ddpanel_nhom'),  // mảng [] (Debug 1)
        onlyDeHuHong: $('#ag_dehu').checked,
        fillRatio: Number($('#ag_fr').value) / 100,
      },
    };

    openModal({ title: 'Đang tạo đơn…', body: '<div class="loading">Đang cân đối ngân sách & sinh đơn…</div>', foot: [] });
    const result = useAI ? await window.API.autoGeneratePOsAI(params) : await window.API.autoGeneratePOs(params);

    if (!result.success) {
      openModal({ title: '⚠️ Không tạo được', body: `<div class="alert alert-warn">${esc(result.error || 'Lỗi không xác định')}</div>`,
        foot: [{ label: 'Quay lại', class: 'btn-light', onClick: openAutoGenerate }] });
      return;
    }
    // tái dùng PO Preview: gắn planDraft + poPreview rồi mở preview
    AppState.planDraft = kh;
    AppState.poPreview = result;
    AppState.cache.baseSpent = used;
    showAutoPreview(result, kh, budget);
  }

    /* ====================================================================
   *  DEBUG 2 — PREVIEW EDITOR (chỉnh sửa nhanh trước khi tạo đơn)
   *  Dùng chung cho cả Auto-Split (runPoEngine) và Auto-Generate.
   * ==================================================================== */
  async function showAutoPreview(result, kh, budget) {
    AppState.poPreview = result;
    AppState.cache.allData = AppState.cache.allData || await window.API.listData();
    const nccMap = Object.fromEntries((await window.API.listNCC()).map(n => [n.id_ncc, n.ten_ncc]));
    AppState.cache.nccMap = nccMap;
    AppState.cache.previewBudget = budget;

    openModal({
      wide: true,
      xwide: true,
      title: `⚡ Xem trước & chỉnh sửa ${result.purchase_orders.length} đơn`,
      body: `
        ${result.warnings_general.length ? `<div class="alert alert-warn">${result.warnings_general.map(esc).join('<br>')}</div>` : ''}
        <div class="po-preview" id="poEditWrap"></div>
        <div class="alert" id="poEditSum"></div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: () => { AppState.poPreview = null; closeModal(); } },
        { label: '🔄 Sinh lại', class: 'btn-light', onClick: openAutoGenerate },
        { label: `✅ Xác nhận tạo đơn`, class: 'btn-primary', onClick: () => commitPOs() },
      ],
    });
    renderPreviewEditor();
  }

  // Render lại toàn bộ editor preview từ AppState.poPreview
  function renderPreviewEditor() {
    const wrap = $('#poEditWrap'); if (!wrap) return;
    const result = AppState.poPreview;
    const nccMap = AppState.cache.nccMap || {};

    wrap.innerHTML = result.purchase_orders.map((po, pi) => {
      // tính lại giá trị đơn
      po._lines.forEach(l => l.thanh_tien = (l.so_luong || 0) * (l.don_gia_thuc_te || 0));
      po.gia_tri_don_hang = po._lines.reduce((a, l) => a + l.thanh_tien, 0);
      return `
      <div class="po-card">
        <div class="po-head">
          <div><b>${esc(po.ma_don_hang)}</b><br><small>${esc(po.id_ncc)} — ${esc(nccMap[po.id_ncc] || '')}</small></div>
          <div class="po-val" data-poval="${pi}">${fmt(po.gia_tri_don_hang)}</div>
        </div>
        <table class="tbl sm po-edit-tbl">
          <thead><tr><th style="width:120px">Mã</th><th>Tên mặt hàng</th><th style="width:70px">ĐVT</th>
            <th style="width:80px">SL</th><th style="width:120px">Đơn giá</th><th style="width:120px">Thành tiền</th><th style="width:40px"></th></tr></thead>
          <tbody>
          ${po._lines.map((l, li) => `
            <tr>
              <td><input class="cell-inp" list="dlMaHang" value="${esc(l.ma_hang || '')}" data-edit="ma" data-pi="${pi}" data-li="${li}" placeholder="Mã / nhập tên"></td>
              <td><input class="cell-inp" value="${esc(l.ten_hang_hoa || '')}" data-edit="ten" data-pi="${pi}" data-li="${li}" placeholder="Tên mặt hàng"></td>
              <td><input class="cell-inp" value="${esc(l.dvt || '')}" data-edit="dvt" data-pi="${pi}" data-li="${li}"></td>
              <td><input class="cell-inp" type="number" min="1" step="1" value="${l.so_luong}" data-edit="sl" data-pi="${pi}" data-li="${li}"></td>
              <td><input class="cell-inp" type="number" min="0" value="${l.don_gia_thuc_te}" data-edit="dg" data-pi="${pi}" data-li="${li}"></td>
              <td class="cell-amt">${fmt(l.thanh_tien)}</td>
              <td><button class="ibtn ibtn-danger" data-rmline data-pi="${pi}" data-li="${li}" title="Xóa dòng">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <button class="btn btn-sm btn-light" data-addline data-pi="${pi}">➕ Thêm dòng</button>
      </div>`;
    }).join('') +
    // datalist gợi ý mã hàng để auto-điền tên/đvt/giá
    `<datalist id="dlMaHang">${(AppState.cache.allData || []).slice(0, 1000)
        .map(d => `<option value="${esc(d.ma_hang)}">${esc(d.ten_hang_hoa)}</option>`).join('')}</datalist>`;

    bindPreviewEvents();
    refreshPreviewSum();
  }

  function bindPreviewEvents() {
    const result = AppState.poPreview;

    // Sửa ô (ma/ten/dvt/sl/dg)

    $$('[data-edit]', $('#poEditWrap')).forEach(inp => {
      inp.onchange = () => {
        const pi = +inp.dataset.pi, li = +inp.dataset.li, field = inp.dataset.edit;
        const line = result.purchase_orders[pi]._lines[li];
        if (field === 'sl')  line.so_luong = Math.max(1, Math.round(+inp.value || 1));
        else if (field === 'dg') line.don_gia_thuc_te = Math.max(0, +inp.value || 0);
        else if (field === 'dvt') line.dvt = inp.value.trim();
        else if (field === 'ten') line.ten_hang_hoa = inp.value.trim();
        else if (field === 'ma') {
          line.ma_hang = inp.value.trim();
          // Nếu trùng mã trong DATA -> tự điền tên/đvt/đơn giá/nhóm (tùy chọn thay mặt hàng mới)
          const d = (AppState.cache.allData || []).find(x => x.ma_hang === line.ma_hang);
          if (d) {
            line.ten_hang_hoa = d.ten_hang_hoa; line.dvt = d.dvt;
            line.don_gia_thuc_te = d.don_gia;
            line.id_nhom = d.id_nhom; line.ma_nhom = d.ma_nhom; line.phan_loai_nhom_hang = d.phan_loai_nhom_hang;
          }
        }
        renderPreviewEditor(); // vẽ lại để cập nhật tên/giá/thành tiền
      };
    });

    // Xóa dòng

    $$('[data-rmline]', $('#poEditWrap')).forEach(b => b.onclick = () => {
      const pi = +b.dataset.pi, li = +b.dataset.li;
      result.purchase_orders[pi]._lines.splice(li, 1);
      // nếu đơn rỗng -> xóa luôn đơn
      if (!result.purchase_orders[pi]._lines.length) result.purchase_orders.splice(pi, 1);
      if (!result.purchase_orders.length) { toast('Đã xóa hết — không còn đơn nào', 'info'); }
      renderPreviewEditor();
    });

    // Thêm dòng trống (người dùng nhập tên / mã để thay mặt hàng mới)

    $$('[data-addline]', $('#poEditWrap')).forEach(b => b.onclick = () => {
      const pi = +b.dataset.pi;
      result.purchase_orders[pi]._lines.push({
        ma_hang: '', ten_hang_hoa: '', dvt: '', id_nhom: '', ma_nhom: '', phan_loai_nhom_hang: '',
        so_luong: 1, don_gia_thuc_te: 0, thanh_tien: 0,
      });
      renderPreviewEditor();
    });
  }

  function refreshPreviewSum() {
    const result = AppState.poPreview;
    const total = result.purchase_orders.reduce((a, p) => a + (p.gia_tri_don_hang || 0), 0);
    result.budget_utilization = result.budget_utilization || {};
    result.budget_utilization.total_allocated = total;
    const budget = AppState.cache.previewBudget;
    const sum = $('#poEditSum');
    if (sum) {
      const over = (budget != null) && total > budget;
      sum.innerHTML = `Tổng phân bổ: <b class="${over ? 'txt-danger' : ''}">${fmt(total)}</b>`
        + (budget != null ? ` / Ngân sách còn lại: <b>${fmt(budget)}</b>` : '')
        + (over ? ' — <b class="txt-danger">VƯỢT NGÂN SÁCH</b>' : '');
    }
  }

  /* ====================================================================
   *  CRUD NHÀ CUNG CẤP (nâng cấp màn NCC)
   * ==================================================================== */
  function nccForm(n) {
    const e = n || {};
    const nhomOpts = C.DANH_MUC_NHOM
      .map(g => g.ma_nhom).filter((v, i, a) => a.indexOf(v) === i); // mã nhóm duy nhất
    openModal({
      title: n ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp',
      body: `
        <div class="form-grid">
          <label>Mã NCC ${n ? '' : '(tự sinh nếu trống)'}<input id="n_id" value="${esc(e.id_ncc || '')}" ${n ? 'readonly' : ''}></label>
          <label>Tên NCC *<input id="n_ten" value="${esc(e.ten_ncc || '')}"></label>
          <label class="col-2">Nhóm phụ trách (giữ Ctrl để chọn nhiều) *
            <select id="n_nhom" multiple size="6">${nhomOpts.map(m => `<option value="${m}" ${(e.nhom_phu_trach || []).includes(m) ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          <label>Điện thoại<input id="n_dt" value="${esc(e.dien_thoai || '')}"></label>
          <label>Địa chỉ<input id="n_dc" value="${esc(e.dia_chi || '')}"></label>
        </div>
        <div class="alert sm">Lưu ý: thay đổi nhóm phụ trách sẽ ảnh hưởng ánh xạ Nhóm→NCC khi tạo đơn. Mã nhóm KHA dùng chung 4 nhóm con.</div>`,
      foot: [
        { label: 'Hủy', class: 'btn-light', onClick: closeModal },
        { label: 'Lưu', class: 'btn-primary', onClick: async () => {
          const ten = $('#n_ten').value.trim();
          const nhom = $$('#n_nhom option', $('#modalBody')).filter(o => o.selected).map(o => o.value);
          if (!ten) return toast('Nhập tên NCC', 'error');
          if (!nhom.length) return toast('Chọn ít nhất 1 nhóm phụ trách', 'error');
          await window.API.saveNCC({
            id_ncc: e.id_ncc || $('#n_id').value.trim() || undefined,
            ten_ncc: ten, nhom_phu_trach: nhom,
            dien_thoai: $('#n_dt').value.trim(), dia_chi: $('#n_dc').value.trim(),
          });
          closeModal(); toast('Đã lưu nhà cung cấp', 'success'); renderNCC();
        } },
      ],
    });
  }

  /* -------------------- BOOTSTRAP -------------------- */
  async function boot() {
    try {
      await window.API.openDB();
      const seeded = await window.API.seedIfEmpty();
      const ai = await window.API.aiStatus();
      $('#aiStatusPill').textContent = 'TandigitalAI: ' + ai.mode;
      if (seeded) toast('Đã khởi tạo 300 mặt hàng mẫu', 'success');
      await navigate('dashboard');
    } catch (e) {
      view().innerHTML = `<div class="empty">Không khởi tạo được CSDL: ${esc(e.message)}</div>`;
      console.error(e);
    }
  }

  // expose vài hàm render cho các phần sau (Phần 2 & 3 sẽ định nghĩa)
  window.__APP__ = { navigate, toast, openModal, closeModal, statusBadge, esc, fmt, $, $$, view, toolbarBtn, emptyBox, card, AppState };

  document.addEventListener('DOMContentLoaded', boot);

})(); // <-- ĐÓNG IIFE app.js
