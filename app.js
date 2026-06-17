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

  /* -------------------- BOOTSTRAP -------------------- */
  async function boot() {
    try {
      await window.API.openDB();
      const seeded = await window.API.seedIfEmpty();
      const ai = await window.API.aiStatus();
      $('#aiStatusPill').textContent = 'AI: ' + ai.mode;
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

    /* ====================================================================
   *  MÀN HÌNH 3 — KẾ HOẠCH MUA SẮM
   * ==================================================================== */
  async function renderKeHoach() {
    toolbarBtn('Lập kế hoạch mới', 'btn-primary', () => keHoachForm(), '➕');
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
    openModal({
      wide: true,
      title: '⚙️ Xem trước đơn hàng tự động (Auto-Split)',
      body: `
        ${result.warnings_general.length ? `<div class="alert alert-warn">${result.warnings_general.map(esc).join('<br>')}</div>` : ''}
        <div class="po-preview">
          ${result.purchase_orders.map((po, idx) => `
            <div class="po-card">
              <div class="po-head">
                <div><b>${esc(po.ma_don_hang)}</b><br><small>${esc(po.id_ncc)} — ${esc(nccMap[po.id_ncc] || '')}</small></div>
                <div class="po-val">${fmt(po.gia_tri_don_hang)}</div>
              </div>
              ${po.warnings.length ? `<div class="alert alert-warn sm">${po.warnings.map(esc).join('<br>')}</div>` : ''}
              <table class="tbl sm"><thead><tr><th>Mã</th><th>Tên</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
                <tbody>${po._lines.map(l => `<tr><td>${esc(l.ma_hang)}</td><td>${esc(l.ten_hang_hoa)}</td>
                  <td>${l.so_luong}</td><td>${fmt(l.don_gia_thuc_te)}</td><td>${fmt(l.thanh_tien)}</td></tr>`).join('')}</tbody></table>
            </div>`).join('')}
        </div>
        <div class="alert">Tổng phân bổ: <b>${fmt(result.budget_utilization.total_allocated)}</b> / Ngân sách: <b>${fmt(kh.tong_du_tru)}</b></div>`,
      foot: [
        { label: 'Quay lại', class: 'btn-light', onClick: () => openPickItems(kh.id_ke_hoach) },
        { label: '✅ Xác nhận tạo ' + result.purchase_orders.length + ' đơn', class: 'btn-primary', onClick: () => commitPOs() },
      ],
    });
  }

  // Ghi các PO + chi tiết vào IndexedDB
  async function commitPOs() {
    const kh = AppState.planDraft;
    const result = AppState.poPreview;
    for (const po of result.purchase_orders) {
      const poObj = {
        id_don_hang: po.id_don_hang, ma_don_hang: po.ma_don_hang,
        id_ke_hoach: kh.id_ke_hoach, id_ncc: po.id_ncc,
        gia_tri_don_hang: po.gia_tri_don_hang, trang_thai: C.PO_STATUS.NHAP,
        ngay_gui: null, ghi_chu: po.warnings.join(' | '),
      };
      await window.API.saveDonHang(poObj);
      for (const l of po._lines) {
        await window.API.saveChiTiet({
          id_don_hang: po.id_don_hang, ma_hang: l.ma_hang, ten_hang_hoa: l.ten_hang_hoa,
          dvt: l.dvt || '', so_luong: l.so_luong,
          don_gia_de_xuat: l.don_gia_thuc_te, don_gia_thuc_te: l.don_gia_thuc_te,
          thanh_tien: l.thanh_tien, ghi_chu_dong: '',
        });
      }
    }
    // cập nhật trạng thái kế hoạch -> Đang thực hiện
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
              <button class="ibtn" data-pdf="${d.id_don_hang}" title="In PDF">🖨️</button>
              <button class="ibtn" data-xls="${d.id_don_hang}" title="Xuất Excel">📊</button>
              ${C.PO_NO_DELETE_FROM.includes(d.trang_thai) ? '' : `<button class="ibtn ibtn-danger" data-del="${d.id_don_hang}" title="Xóa">🗑️</button>`}
            </td></tr>`;
        }).join('')}</tbody></table>` : emptyBox('Không có đơn hàng phù hợp.'));


      $$('[data-view]', view()).forEach(b => b.onclick = () => openPoDetail(b.dataset.view));

      $$('[data-pdf]', view()).forEach(b => b.onclick = () => printPO(b.dataset.pdf));

      $$('[data-xls]', view()).forEach(b => b.onclick = () => exportPoExcel(b.dataset.xls));

      $$('[data-del]', view()).forEach(b => b.onclick = () => confirmDelPO(b.dataset.del));
    };
    $('#dhFilter').onchange = draw;
    $('#dhSearch').oninput = draw;
    draw();
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

  /* -------------------- XUẤT EXCEL 1 ĐƠN (SheetJS) -------------------- */
  async function exportPoExcel(id) {
    const po = await window.API.getDonHang(id);
    const cts = await window.API.listChiTietByDon(id);
    const aoa = [
      ['ĐƠN ĐẶT HÀNG', '', '', '', '', '', ''],
      ['Mã đơn:', po.ma_don_hang, '', 'NCC:', po.id_ncc, '', ''],
      C.EXCEL_COLS.PO_DETAIL,
      ...cts.map((c, i) => [i + 1, c.ma_hang, c.ten_hang_hoa, c.dvt, c.so_luong, c.don_gia_thuc_te, c.thanh_tien, c.ghi_chu_dong || '']),
      ['', '', '', '', '', 'TỔNG', po.gia_tri_don_hang, ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 38 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DonHang');
    XLSX.writeFile(wb, `${po.ma_don_hang}.xlsx`);
    toast('Đã xuất Excel', 'success');
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
    XLSX.writeFile(wb, 'DanhMuc_VatTu.xlsx'); toast('Đã xuất Excel danh mục', 'success');
  }

  /* ====================================================================
   *  MÀN HÌNH 7 — NHÀ CUNG CẤP
   * ==================================================================== */
  async function renderNCC() {
    const [nccs, dhs] = await Promise.all([window.API.listNCC(), window.API.listDonHang()]);
    const active = dhs.filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
    view().innerHTML = `<div class="ncc-grid">${nccs.map(n => {
      const po = active.filter(d => d.id_ncc === n.id_ncc);
      const total = po.reduce((a, b) => a + b.gia_tri_don_hang, 0);
      return `<div class="card ncc-card">
        <div class="ncc-head"><b>${esc(n.id_ncc)}</b> ${esc(n.ten_ncc)}</div>
        <div class="ncc-body">
          <div class="mini-stat"><span>Nhóm phụ trách</span><strong>${n.nhom_phu_trach.join(', ')}</strong></div>
          <div class="mini-stat"><span>Số đơn hàng</span><strong>${po.length}</strong></div>
          <div class="mini-stat"><span>Tổng giá trị</span><strong>${fmt(total)}</strong></div>
          <div class="mini-stat"><span>Điện thoại</span><strong>${esc(n.dien_thoai || '')}</strong></div>
          <small>${esc(n.dia_chi || '')}</small>
        </div></div>`;
    }).join('')}</div>`;
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
        <p class="muted">Nạp file 300 mặt hàng thật (cột: ma_hang, ten_hang_hoa, dvt, don_gia, gia_thi_truong, phan_loai_nhom_hang, id_nhom, ma_nhom, nha_cung_cap, muc_dich_su_dung, muc_do_hu_hong, chu_ky_thay_the, phan_loai_chi_phi). Sẽ thay thế danh mục hiện tại.</p>
        <label class="btn btn-warn">Chọn file Excel/JSON<input id="fileImport" type="file" accept=".xlsx,.xls,.json" hidden></label>`)}
      ${card(`<h3>⚠️ Xóa & khởi tạo lại dữ liệu mẫu</h3>
        <button class="btn btn-danger" id="btnReset">Xóa toàn bộ & nạp 300 mẫu</button>`)}`;

    $('#btnSaveKeys').onclick = async () => {
      await window.API.setSetting('gemini_key', $('#set_gemini').value.trim());
      await window.API.setSetting('nvidia_key', $('#set_nvidia').value.trim());
      const s = await window.API.aiStatus(); $('#aiStatusPill').textContent = 'AI: ' + s.mode;
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

})(); // <-- ĐÓNG IIFE app.js
