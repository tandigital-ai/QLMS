/* =====================================================================
 * api.js — Tầng dữ liệu (IndexedDB), Parser chuẩn hóa, PO Engine, AI.
 * Tất cả expose qua window.API
 * ===================================================================== */
window.API = (function () {
  const C = window.CONFIG;
  const S = C.DB.STORE;
  let _db = null;

  /* -------------------- 1. KẾT NỐI INDEXEDDB -------------------- */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(C.DB.NAME, C.DB.VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const mk = (name, keyPath, indexes) => {
          if (db.objectStoreNames.contains(name)) return;
          const os = db.createObjectStore(name, { keyPath });
          (indexes || []).forEach(ix => os.createIndex(ix.name, ix.key, { unique: !!ix.unique }));
        };
        mk(S.DATA, 'ma_hang', [{ name: 'id_nhom', key: 'id_nhom' }, { name: 'nha_cung_cap', key: 'nha_cung_cap' }]);
        mk(S.NHOM, 'id_nhom');
        mk(S.NCC, 'id_ncc');
        mk(S.CONG_TRINH, 'id_cong_trinh', [{ name: 'ma_cong_trinh', key: 'ma_cong_trinh' }]);
        mk(S.KE_HOACH, 'id_ke_hoach', [{ name: 'id_cong_trinh', key: 'id_cong_trinh' }, { name: 'thang_nam', key: 'thang_nam' }]);
        mk(S.DON_HANG, 'id_don_hang', [{ name: 'id_ke_hoach', key: 'id_ke_hoach' }, { name: 'id_ncc', key: 'id_ncc' }, { name: 'trang_thai', key: 'trang_thai' }]);
        mk(S.CHI_TIET, 'id_chi_tiet', [{ name: 'id_don_hang', key: 'id_don_hang' }, { name: 'ma_hang', key: 'ma_hang' }]);
        mk(S.THANH_TOAN, 'id_thanh_toan', [{ name: 'id_don_hang', key: 'id_don_hang' }]);
        mk(S.SEQ, 'key');
        mk(S.SETTINGS, 'key');
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(store, mode) { return _db.transaction(store, mode).objectStore(store); }

  function put(store, obj) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').put(obj);
      r.onsuccess = () => res(obj); r.onerror = () => rej(r.error);
    });
  }
  function bulkPut(store, arr) {
    return new Promise((res, rej) => {
      const t = _db.transaction(store, 'readwrite'); const os = t.objectStore(store);
      arr.forEach(o => os.put(o));
      t.oncomplete = () => res(arr.length); t.onerror = () => rej(t.error);
    });
  }
  function get(store, key) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readonly').get(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  function getAll(store) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readonly').getAll();
      r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
    });
  }
  function getByIndex(store, indexName, value) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readonly').index(indexName).getAll(value);
      r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
    });
  }
  function del(store, key) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').delete(key);
      r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
    });
  }
  function clearStore(store) {
    return new Promise((res, rej) => {
      const r = tx(store, 'readwrite').clear();
      r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
    });
  }

  /* -------------------- 2. PARSER CHUẨN HÓA (R-03) -------------------- */
  // "1 tháng" -> [1,1]; "từ 1 đến 3 tháng" -> [1,3]; "từ 12 đến 18 tháng" -> [12,18]
  function parseChuKy(text) {
    if (!text) return [null, null];
    const nums = String(text).match(/\d+/g);
    if (!nums) return [null, null];
    if (nums.length === 1) return [Number(nums[0]), Number(nums[0])];
    return [Number(nums[0]), Number(nums[1])];
  }
  // "110000 - 160000" -> {min:110000, max:160000}
  function parseGiaThiTruong(text) {
    if (!text) return { min: null, max: null };
    const nums = String(text).replace(/[.,]/g, '').match(/\d+/g);
    if (!nums) return { min: null, max: null };
    if (nums.length === 1) return { min: Number(nums[0]), max: Number(nums[0]) };
    return { min: Number(nums[0]), max: Number(nums[1]) };
  }
  // Bổ sung trường đã-parse cho 1 mặt hàng
  function enrichItem(it) {
    const [ck_min, ck_max] = parseChuKy(it.chu_ky_thay_the);
    const g = parseGiaThiTruong(it.gia_thi_truong);
    return { ...it, _ck_min: ck_min, _ck_max: ck_max, _gia_min: g.min, _gia_max: g.max };
  }

  /* -------------------- 3. KHỞI TẠO DỮ LIỆU GỐC -------------------- */
  async function seedIfEmpty() {
    const existing = await getAll(S.DATA);
    if (existing.length > 0) return false;
    const enriched = window.SEED.ITEMS.map(enrichItem);
    await bulkPut(S.DATA, enriched);
    await bulkPut(S.NHOM, window.SEED.NHOM);
    await bulkPut(S.NCC, window.SEED.NCC);
    return true;
  }

  // (Phần 2 & 3 tiếp ngay bên dưới — cùng file, cùng IIFE)
  /* -------------------- 4. TIỆN ÍCH -------------------- */
  const uuid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  const nowStr = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const todayStr = () => new Date().toISOString().slice(0, 10);

  /* -------------------- 5. SINH MÃ PO (PO-YYYYMM-NCCxxx-STT) -------------------- */
  // Bộ đếm STT theo key = thang_nam_không_gạch + id_ncc
  async function nextPoSeq(thang_nam, id_ncc) {
    const key = `${thang_nam.replace('-', '')}_${id_ncc}`;
    let rec = await get(S.SEQ, key);
    const next = (rec ? rec.value : 0) + 1;
    await put(S.SEQ, { key, value: next });
    return next;
  }
  async function buildPoCode(thang_nam, id_ncc) {
    const seq = await nextPoSeq(thang_nam, id_ncc);
    return `PO-${thang_nam.replace('-', '')}-${id_ncc}-${String(seq).padStart(3, '0')}`;
  }

  /* -------------------- 6. CRUD CÔNG TRÌNH -------------------- */
  async function saveCongTrinh(o) {
    if (!o.id_cong_trinh) o.id_cong_trinh = uuid();
    return put(S.CONG_TRINH, o);
  }
  const listCongTrinh = () => getAll(S.CONG_TRINH);
  const getCongTrinh = (id) => get(S.CONG_TRINH, id);
  const delCongTrinh = (id) => del(S.CONG_TRINH, id);

  /* -------------------- 7. CRUD KẾ HOẠCH -------------------- */
  async function saveKeHoach(o) {
    if (!o.id_ke_hoach) { o.id_ke_hoach = uuid(); o.ngay_lap = o.ngay_lap || todayStr(); }
    return put(S.KE_HOACH, o);
  }
  const listKeHoach = () => getAll(S.KE_HOACH);
  const getKeHoach = (id) => get(S.KE_HOACH, id);
  const delKeHoach = (id) => del(S.KE_HOACH, id);

  /* -------------------- 8. CRUD DATA (vật tư) -------------------- */
  const listData = () => getAll(S.DATA);
  const getDataItem = (ma) => get(S.DATA, ma);
  // Lưu / cập nhật 1 mặt hàng (tự enrich để có _ck_min/_ck_max/_gia_min/_gia_max)
  async function saveDataItem(item) {
    return put(S.DATA, enrichItem(item));
  }
  // Xóa 1 mặt hàng theo mã
  const deleteDataItem = (ma) => del(S.DATA, ma);

  const listNCC = () => getAll(S.NCC);
  const listNhom = () => getAll(S.NHOM);
  const getNhom = (id) => get(S.NHOM, id);
  // Lưu / cập nhật 1 nhóm phụ trách
  async function saveNhom(o) {
    if (!o.id_nhom) {
      // sinh id_nhom kế tiếp dạng NHxx
      const all = await getAll(S.NHOM);
      let max = 0; all.forEach(n => { const m = /NH(\d+)/.exec(n.id_nhom); if (m) max = Math.max(max, +m[1]); });
      o.id_nhom = 'NH' + String(max + 1).padStart(2, '0');
    }
    return put(S.NHOM, o);
  }
  // Xóa 1 nhóm — chặn nếu còn vật tư thuộc nhóm này
  async function deleteNhom(id_nhom) {
    const items = await getByIndex(S.DATA, 'id_nhom', id_nhom);
    if (items.length) throw new Error(`Không thể xóa: còn ${items.length} vật tư thuộc nhóm này.`);
    return del(S.NHOM, id_nhom);
  }
  // Đếm số vật tư theo từng nhóm (phục vụ hiển thị)
  async function countItemsByNhom() {
    const all = await getAll(S.DATA);
    const map = {};
    all.forEach(it => { map[it.id_nhom] = (map[it.id_nhom] || 0) + 1; });
    return map;
  }

  /* -------------------- 9. CRUD ĐƠN HÀNG + CHI TIẾT -------------------- */
  async function saveDonHang(po) {
    if (!po.id_don_hang) po.id_don_hang = uuid();
    if (!po.ngay_tao) po.ngay_tao = nowStr();   // luôn đảm bảo có ngày tạo
    po.ngay_cap_nhat_trang_thai = nowStr();
    return put(S.DON_HANG, po);
  }
  const listDonHang = () => getAll(S.DON_HANG);
  const getDonHang = (id) => get(S.DON_HANG, id);
  const listDonHangByKeHoach = (idkh) => getByIndex(S.DON_HANG, 'id_ke_hoach', idkh);
  const listChiTietByDon = (iddh) => getByIndex(S.CHI_TIET, 'id_don_hang', iddh);
  const saveChiTiet = (ct) => { if (!ct.id_chi_tiet) ct.id_chi_tiet = uuid(); return put(S.CHI_TIET, ct); };

  // Xóa PO (chặn theo ràng buộc cứng)
  async function deleteDonHang(id) {
    const po = await getDonHang(id);
    if (!po) throw new Error('Không tìm thấy đơn hàng');
    if (C.PO_NO_DELETE_FROM.includes(po.trang_thai))
      throw new Error(`Không thể xóa đơn ở trạng thái "${po.trang_thai}" (ràng buộc cứng).`);
    const cts = await listChiTietByDon(id);
    for (const ct of cts) await del(S.CHI_TIET, ct.id_chi_tiet);
    await del(S.DON_HANG, id);
    return true;
  }

  // Chuyển trạng thái có kiểm tra PO_FLOW
  async function changePoStatus(id, newStatus, note) {
    const po = await getDonHang(id);
    if (!po) throw new Error('Không tìm thấy đơn hàng');
    const allowed = C.PO_FLOW[po.trang_thai] || [];
    if (!allowed.includes(newStatus))
      throw new Error(`Không thể chuyển từ "${po.trang_thai}" sang "${newStatus}".`);
    if (newStatus === C.PO_STATUS.DA_HUY && !note)
      throw new Error('Hủy đơn yêu cầu nhập lý do.');
    if (newStatus === C.PO_STATUS.DA_GUI && !po.ngay_gui) po.ngay_gui = nowStr();
    po.trang_thai = newStatus;
    if (note) po.ghi_chu = (po.ghi_chu ? po.ghi_chu + ' | ' : '') + note;
    return saveDonHang(po);
  }

  /* -------------------- 10. CẢNH BÁO TRÙNG LẶP (Bước 2) -------------------- */
  // Trả về { level, label, color, requireReason, lastDate, monthsSince }
  async function checkDuplicate(ma_hang) {
    const item = await getDataItem(ma_hang);
    const ck = item ? [item._ck_min, item._ck_max] : parseChuKy(item && item.chu_ky_thay_the);
    const ckMax = (item && item._ck_max) != null ? item._ck_max : (ck[1] || 0);
    // tìm tất cả chi tiết của mã hàng này trong các đơn không-hủy
    const allCt = await getByIndex(S.CHI_TIET, 'ma_hang', ma_hang);
    let lastDate = null;
    for (const ct of allCt) {
      const po = await getDonHang(ct.id_don_hang);
      if (!po || po.trang_thai === C.PO_STATUS.DA_HUY) continue;
      const d = po.ngay_tao ? po.ngay_tao.slice(0, 10) : null;
      if (d && (!lastDate || d > lastDate)) lastDate = d;
    }
    if (!lastDate) return { level: 'none', label: '', lastDate: null, monthsSince: null };
    const monthsSince = monthsBetween(lastDate, todayStr());
    // Luật phân tích chu kỳ
    if (monthsSince < 1 && ckMax <= 3)
      return { level: 'info', label: 'Đã mua T-1', color: 'blue', requireReason: false, lastDate, monthsSince };
    if (ckMax > 12 && monthsSince <= 12)
      return { level: 'red', label: 'Bất thường nghiêm trọng', color: 'red', requireReason: true, lastDate, monthsSince };
    if (ckMax > 6 && monthsSince <= 6)
      return { level: 'yellow', label: 'Cảnh báo trùng lặp', color: 'yellow', requireReason: false, lastDate, monthsSince };
    return { level: 'none', label: '', lastDate, monthsSince };
  }
  function monthsBetween(d1, d2) {
    const a = new Date(d1), b = new Date(d2);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30;
  }

    // Số tháng giữa 2 chuỗi "YYYY-MM" (vd "2026-04" -> "2026-06" = 2)
  function monthsBetweenYM(ym1, ym2) {
    const [y1, m1] = ym1.split('-').map(Number);
    const [y2, m2] = ym2.split('-').map(Number);
    return (y2 - y1) * 12 + (m2 - m1);
  }

  // Lấy Set các ma_hang ĐÃ có đơn (không-hủy) trong tháng thang_nam ("YYYY-MM")
  async function getMaHangPurchasedInMonth(thang_nam) {
    const key = thang_nam.replace('-', ''); // YYYYMM
    const set = new Set();
    const allPO = await getAll(S.DON_HANG);
    for (const po of allPO) {
      if (po.trang_thai === C.PO_STATUS.DA_HUY) continue;
      const m = /PO-(\d{6})-/.exec(po.ma_don_hang || '');
      const poKey = m ? m[1] : (po.ngay_tao || '').slice(0, 7).replace('-', '');
      if (poKey !== key) continue;
      const cts = await getByIndex(S.CHI_TIET, 'id_don_hang', po.id_don_hang);
      cts.forEach(c => set.add(c.ma_hang));
    }
    return set;
  }

  // Map ma_hang -> { thang:"YYYY-MM" } lần mua gần nhất ở các tháng TRƯỚC thang_nam
  async function getLastPurchaseBeforeMonth(thang_nam) {
    const curKey = thang_nam.replace('-', '');
    const map = {};
    const allPO = await getAll(S.DON_HANG);
    for (const po of allPO) {
      if (po.trang_thai === C.PO_STATUS.DA_HUY) continue;
      const m = /PO-(\d{6})-/.exec(po.ma_don_hang || '');
      const poKey = m ? m[1] : (po.ngay_tao || '').slice(0, 7).replace('-', '');
      if (poKey >= curKey) continue; // chỉ xét tháng trước
      const ym = poKey.slice(0, 4) + '-' + poKey.slice(4, 6);
      const cts = await getByIndex(S.CHI_TIET, 'id_don_hang', po.id_don_hang);
      cts.forEach(c => {
        if (!map[c.ma_hang] || ym > map[c.ma_hang].thang) map[c.ma_hang] = { thang: ym };
      });
    }
    return map;
  }

  /* -------------------- 11. PO ENGINE: Auto-Split (Bước 3) -------------------- */
  // input: { thang_nam, items:[{...DATA fields, so_luong, don_gia_thuc_te}], minOrder, maxOrder }
  // KHÔNG gọi LLM — tính toán deterministic, chính xác 100%.
  async function buildPurchaseOrders({ thang_nam, items, minOrder, maxOrder }) {
    minOrder = minOrder ?? C.ORDER_CONSTRAINTS.MIN_ORDER;
    maxOrder = maxOrder ?? C.ORDER_CONSTRAINTS.MAX_ORDER;

    // B1: Gom theo NCC. Map qua ma_nhom -> NCC nhưng GIỮ id_nhom để truy vết (R-01)
    const byNcc = {};
    for (const it of items) {
      const ncc = it.nha_cung_cap && /^NCC\d{3}$/.test(it.nha_cung_cap)
        ? it.nha_cung_cap
        : C.GROUP_TO_NCC[it.ma_nhom];
      if (!ncc) continue;
      (byNcc[ncc] = byNcc[ncc] || []).push({
        ma_hang: it.ma_hang, ten_hang_hoa: it.ten_hang_hoa, dvt: it.dvt,
        id_nhom: it.id_nhom, phan_loai_nhom_hang: it.phan_loai_nhom_hang,
        ma_nhom: it.ma_nhom, muc_do_hu_hong: it.muc_do_hu_hong,
        so_luong: Math.max(1, Math.round(it.so_luong || 1)),
        don_gia_thuc_te: it.don_gia_thuc_te ?? it.don_gia,
      });
    }

    const purchase_orders = [], warnings_general = [];
    let total_allocated = 0;

    for (const ncc of Object.keys(byNcc)) {
      const lines = byNcc[ncc].map(l => ({ ...l, thanh_tien: l.so_luong * l.don_gia_thuc_te }));
      const sum = lines.reduce((a, b) => a + b.thanh_tien, 0);

      if (sum > maxOrder) {
        // B2: Tách PO — ưu tiên giữ cùng phan_loai_nhom_hang chung 1 PO (bin-packing theo nhóm)
        const chunks = splitByGroupGreedy(lines, maxOrder);
        for (const chunk of chunks) {
          const code = await buildPoCode(thang_nam, ncc);
          const val = chunk.reduce((a, b) => a + b.thanh_tien, 0);
          total_allocated += val;
          purchase_orders.push(makePoObj(code, ncc, chunk, val, val < minOrder ? [`Đơn tách có giá trị ${fmt(val)} thấp hơn tối thiểu.`] : []));
        }
      } else {
        const code = await buildPoCode(thang_nam, ncc);
        total_allocated += sum;
        const w = [];
        if (sum < minOrder) {
          const sug = await suggestFillItems(ncc, minOrder - sum);
          w.push(`Giá trị đơn ${fmt(sum)} dưới tối thiểu ${fmt(minOrder)}. Gợi ý bổ sung vật tư dễ hư hỏng: ${sug.map(s => s.ten_hang_hoa).join(', ') || '(không có)'}.`);
        }
        purchase_orders.push(makePoObj(code, ncc, lines, sum, w));
      }
    }
    return {
      success: true, purchase_orders, warnings_general,
      budget_utilization: { total_allocated, budget_limit: null, exceeded: false },
    };
  }

  function makePoObj(code, ncc, lines, val, warnings) {
    return {
      id_don_hang: uuid(), ma_don_hang: code, id_ncc: ncc,
      gia_tri_don_hang: val, trang_thai: C.PO_STATUS.NHAP, ghi_chu: '',
      _lines: lines, warnings: warnings || [],
    };
  }
  // Bin-packing greedy: gom cùng phan_loai_nhom_hang, không vượt cap
  function splitByGroupGreedy(lines, cap) {
    const byGroup = {};
    lines.forEach(l => (byGroup[l.phan_loai_nhom_hang] = byGroup[l.phan_loai_nhom_hang] || []).push(l));
    const bins = [];
    const place = (line) => {
      // dòng đơn lẻ vượt cap -> đứng riêng 1 bin
      if (line.thanh_tien > cap) { bins.push([line]); return; }
      let bin = bins.find(b => b.reduce((a, x) => a + x.thanh_tien, 0) + line.thanh_tien <= cap);
      if (!bin) { bin = []; bins.push(bin); }
      bin.push(line);
    };
    Object.values(byGroup).flat().forEach(place);
    return bins;
  }

  /* -------------------- 12. GỢI Ý BỔ SUNG / THAY THẾ -------------------- */
  // Vật tư dễ hư hỏng cùng NCC để nâng giá trị đơn (nội bộ)
  async function suggestFillItems(id_ncc, needAmount) {
    const all = await listData();
    return all
      .filter(it => (C.GROUP_TO_NCC[it.ma_nhom] === id_ncc) && it.muc_do_hu_hong === 'Dễ hư hỏng')
      .sort((a, b) => a.don_gia - b.don_gia)
      .slice(0, 5);
  }

  // Gợi ý thay thế (Bước 2) — nội bộ; nếu có Gemini key thì re-rank bằng AI
  async function suggestSubstitutes(ma_hang) {
    const base = await getDataItem(ma_hang);
    if (!base) return [];
    const all = await listData();
    const tol = C.SUBSTITUTE.PRICE_TOLERANCE;
    let cands = all.filter(it =>
      it.ma_hang !== base.ma_hang &&
      it.phan_loai_nhom_hang === base.phan_loai_nhom_hang &&   // cùng nhóm (theo TÊN nhóm - R-01)
      it.muc_dich_su_dung === base.muc_dich_su_dung &&         // cùng mục đích
      C.GROUP_TO_NCC[it.ma_nhom] === C.GROUP_TO_NCC[base.ma_nhom] && // cùng NCC
      Math.abs(it.don_gia - base.don_gia) <= base.don_gia * tol     // ±20% đơn giá
    );
    // nới lỏng nếu quá ít
    if (cands.length < C.SUBSTITUTE.MAX_SUGGESTIONS) {
      cands = all.filter(it => it.ma_hang !== base.ma_hang &&
        it.phan_loai_nhom_hang === base.phan_loai_nhom_hang &&
        Math.abs(it.don_gia - base.don_gia) <= base.don_gia * tol);
    }
    cands = cands.sort((a, b) => Math.abs(a.don_gia - base.don_gia) - Math.abs(b.don_gia - base.don_gia))
                 .slice(0, C.SUBSTITUTE.MAX_SUGGESTIONS);

    const key = await getSetting('gemini_key');
    if (key && cands.length) {
      try {
        const reranked = await geminiRerank(base, cands, key);
        if (reranked && reranked.length) return reranked;
      } catch (e) { console.warn('Gemini fallback ->', e.message); }
    }
    return cands;
  }

  /* -------------------- 13. THANH TOÁN & CÔNG NỢ (Bước 5) -------------------- */
  async function saveThanhToan(tt) {
    if (!tt.id_thanh_toan) tt.id_thanh_toan = uuid();
    if (!tt.ngay_tao) tt.ngay_tao = nowStr();
    await put(S.THANH_TOAN, tt);
    // Tính lại công nợ & trạng thái đơn (dùng chung cho cả thêm & sửa)
    return recalcCongNoStatus(tt.id_don_hang);
  }
  async function changePoStatusForce(id, st) {
    const po = await getDonHang(id); po.trang_thai = st; return saveDonHang(po);
  }
  const listThanhToanByDon = (id) => getByIndex(S.THANH_TOAN, 'id_don_hang', id);
  // Lấy 1 giao dịch thanh toán theo id (Debug: sửa/xem)
  const getThanhToan = (id) => get(S.THANH_TOAN, id);
  // Xóa 1 giao dịch thanh toán + tính lại công nợ & trạng thái đơn
  async function deleteThanhToan(id_thanh_toan) {
    const tt = await get(S.THANH_TOAN, id_thanh_toan);
    if (!tt) throw new Error('Không tìm thấy giao dịch thanh toán');
    const id_don_hang = tt.id_don_hang;
    await del(S.THANH_TOAN, id_thanh_toan);
    await recalcCongNoStatus(id_don_hang);
    return true;
  }
  // Tính lại trạng thái thanh toán của đơn dựa trên tổng đã trả hiện tại
  async function recalcCongNoStatus(id_don_hang) {
    const po = await getDonHang(id_don_hang);
    if (!po) return;
    const list = await getByIndex(S.THANH_TOAN, 'id_don_hang', id_don_hang);
    const paid = list.reduce((a, b) => a + (Number(b.so_tien_thanh_toan) || 0), 0);
    let st = po.trang_thai;
    if (paid >= po.gia_tri_don_hang && po.gia_tri_don_hang > 0) {
      st = C.PO_STATUS.DA_THANH_TOAN;
    } else if (paid > 0) {
      st = C.PO_STATUS.TT_MOT_PHAN;
    } else {
      // hết tiền đã trả -> quay lại "Đã xuất hóa đơn" (nếu trước đó đã ở giai đoạn thanh toán)
      if ([C.PO_STATUS.TT_MOT_PHAN, C.PO_STATUS.DA_THANH_TOAN].includes(po.trang_thai))
        st = C.PO_STATUS.DA_XUAT_HD;
    }
    if (st !== po.trang_thai) { po.trang_thai = st; await saveDonHang(po); }
    return { paid, remaining: po.gia_tri_don_hang - paid };
  }
  async function congNoByDon(id) {
    const po = await getDonHang(id);
    const list = await listThanhToanByDon(id);
    const paid = list.reduce((a, b) => a + (Number(b.so_tien_thanh_toan) || 0), 0);
    return { gia_tri: po.gia_tri_don_hang, paid, remaining: po.gia_tri_don_hang - paid };
  }

  /* -------------------- 14. SETTINGS (API key...) -------------------- */
  async function setSetting(key, value) { return put(S.SETTINGS, { key, value }); }
  async function getSetting(key) { const r = await get(S.SETTINGS, key); return r ? r.value : null; }
  // Gọi Google API lấy danh sách model Gemini hỗ trợ generateContent (nút "Cập nhật model")
  async function listGeminiModels(key) {
    const url = `${C.AI.GEMINI.ENDPOINT}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
    const data = await res.json();
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => /gemini/i.test(n))
      .sort();
  }

  /* -------------------- 15. TÍCH HỢP AI (tùy chọn) -------------------- */
    // Gọi Gemini với 1 prompt văn bản, trả về text thuần (dùng chung cho phân tích/đề xuất)
  async function geminiGenerate(prompt, key) {
    const k = key || (await getSetting('gemini_key'));
    if (!k) throw new Error('Chưa cấu hình Gemini API Key');
    const model = (await getSetting('gemini_model')) || C.AI.GEMINI.MODEL;
    const url = `${C.AI.GEMINI.ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(k)}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Phân tích bộ đơn hàng vừa tạo -> trả về nhận xét dạng text (markdown nhẹ)
  async function analyzePurchaseOrders(purchase_orders, ctx) {
    const summary = purchase_orders.map(po => ({
      ma_don: po.ma_don_hang, ncc: po.id_ncc, gia_tri: po.gia_tri_don_hang,
      so_dong: (po._lines || []).length,
      mat_hang: (po._lines || []).map(l => `${l.ten_hang_hoa} x${l.so_luong} (${l.don_gia_thuc_te}đ)`),
    }));
    const prompt = `Bạn là chuyên gia mua sắm vật tư ngành cấp thoát nước. Hãy phân tích NGẮN GỌN bộ đơn đặt hàng sau (tiếng Việt).
Bối cảnh: kỳ ${ctx?.thang_nam || ''}, ngân sách khả dụng ${ctx?.budget || 'N/A'}, mỗi đơn nên trong khoảng [${ctx?.minOrder || ''} ; ${ctx?.maxOrder || ''}] đồng, mỗi đơn 1 nhà cung cấp.
Dữ liệu đơn (JSON): ${JSON.stringify(summary)}.
Yêu cầu trả lời theo 3 mục, mỗi mục 2-4 gạch đầu dòng ngắn:
1. ĐÁNH GIÁ CHUNG (mức độ hợp lý của phân bổ, cân đối giữa các NCC).
2. CẢNH BÁO/RỦI RO (đơn quá nhỏ/quá lớn, mặt hàng đáng ngờ, thiếu đa dạng...).
3. ĐỀ XUẤT CẢI THIỆN (cụ thể, khả thi).
Tuyệt đối không bịa số liệu ngoài dữ liệu đã cho. Trả lời thuần văn bản, không kèm JSON.`;
    return geminiGenerate(prompt, null);
  }

  // Đề xuất thông tin cho 1 vật tư MỚI dựa trên tên + nhóm -> trả về JSON các trường gợi ý
  async function suggestNewItemFields({ ten_hang_hoa, ten_nhom, dvt, don_gia }) {
    const prompt = `Bạn là chuyên gia vật tư ngành cấp thoát nước. Với mặt hàng MỚI sau, hãy đề xuất các thông tin còn thiếu.
Tên hàng: "${ten_hang_hoa}". Nhóm hàng: "${ten_nhom || ''}". ĐVT: "${dvt || ''}". Đơn giá tham khảo: ${don_gia || 'chưa rõ'} đồng.
Hãy trả về DUY NHẤT một JSON đúng định dạng (không thêm chữ nào khác):
{
  "gia_thi_truong": "min - max" (khoảng giá thị trường hợp lý theo đồng VN, ví dụ "80000 - 130000"),
  "muc_dich_su_dung": "mô tả ngắn mục đích sử dụng",
  "muc_do_hu_hong": một trong ["Dễ hư hỏng","Trung bình","Bền"],
  "chu_ky_thay_the": dạng "1 tháng" hoặc "từ 3 đến 6 tháng",
  "phan_loai_chi_phi": một trong ["Chi phí vật tư dụng cụ","Chi phí máy móc thiết bị","Chi phí dịch vụ"]
}`;
    const txt = await geminiGenerate(prompt, null);
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI không trả về dữ liệu hợp lệ');
    return JSON.parse(m[0]);
  }

  async function geminiRerank(base, candidates, key) {
    const prompt = `Bạn là chuyên gia mua sắm vật tư cấp thoát nước. Mặt hàng cần thay thế: "${base.ten_hang_hoa}" (mục đích: ${base.muc_dich_su_dung}, đơn giá ${base.don_gia}).
Danh sách ứng viên (JSON): ${JSON.stringify(candidates.map(c => ({ ma_hang: c.ma_hang, ten: c.ten_hang_hoa, gia: c.don_gia, muc_dich: c.muc_dich_su_dung })))}.
Hãy chọn và sắp xếp tối đa 3 mã phù hợp nhất. CHỈ trả JSON mảng các ma_hang, ví dụ ["X","Y"].`;
    const model = (await getSetting('gemini_model')) || C.AI.GEMINI.MODEL;
    const url = `${C.AI.GEMINI.ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
    const data = await res.json();
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const arr = JSON.parse((txt.match(/\[[\s\S]*\]/) || ['[]'])[0]);
    const map = Object.fromEntries(candidates.map(c => [c.ma_hang, c]));
    return arr.map(m => map[m]).filter(Boolean).slice(0, C.SUBSTITUTE.MAX_SUGGESTIONS);
  }

  // Cho phép NVIDIA NIM tối ưu phân bổ (tùy chọn; mặc định dùng engine nội bộ)
  async function nvidiaOptimize(payload, key) {
    const res = await fetch(C.AI.NVIDIA.ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: C.AI.NVIDIA.MODEL, temperature: 0.1,
        messages: [
          { role: 'system', content: 'You are the Business Logic & Auto-Split Engine. Return ONLY JSON.' },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) throw new Error('NVIDIA HTTP ' + res.status);
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content || '{}';
    return JSON.parse((txt.match(/\{[\s\S]*\}/) || ['{}'])[0]);
  }

  async function aiStatus() {
    const g = await getSetting('gemini_key');
    const model = (await getSetting('gemini_model')) || C.AI.GEMINI.MODEL;
    return { gemini: !!g, nvidia: false, model, mode: g ? 'Gemini AI' : 'Nội bộ' };
  }

  /* -------------------- 16. BACKUP / RESTORE (R-04) -------------------- */
  async function exportBackup() {
    const stores = Object.values(S);
    const dump = {};
    for (const st of stores) dump[st] = await getAll(st);
    dump.__meta = { app: 'QLMS_VATTU', version: C.DB.VERSION, at: nowStr() };
    return dump;
  }
  async function importBackup(dump) {
    for (const st of Object.values(S)) {
      if (!dump[st]) continue;
      await clearStore(st);
      if (dump[st].length) await bulkPut(st, dump[st]);
    }
    return true;
  }

  /* -------------------- 17. HELPER -------------------- */
  function fmt(n) { return (Number(n) || 0).toLocaleString('vi-VN') + ' ₫'; }

    /* ====================================================================
   *  18. AUTO-GENERATOR: Tự động sinh nhiều PO từ ngân sách (Thuật toán)
   *  Input: { thang_nam, budget, minOrder, maxOrder, opts }
   *    opts: { id_ncc?, id_nhom?, onlyDeHuHong?, fillRatio? (0.8..1) }
   *  Cơ chế: chọn pool vật tư phù hợp -> rải đều thành các "túi" PO,
   *  mỗi túi nhắm giá trị mục tiêu trong [min,max], số lượng nguyên dương,
   *  tổng các túi <= budget. Trả về cùng cấu trúc buildPurchaseOrders.
   * ==================================================================== */
  async function autoGeneratePOs({ thang_nam, budget, minOrder, maxOrder, opts }) {
    minOrder = minOrder ?? C.ORDER_CONSTRAINTS.MIN_ORDER;
    maxOrder = maxOrder ?? C.ORDER_CONSTRAINTS.MAX_ORDER;
    opts = opts || {};
    const fillRatio = Math.min(1, Math.max(0.5, opts.fillRatio || 0.92));
    // Tỷ lệ cho phép trùng mặt hàng so với các kỳ TRƯỚC (0 = chặn tuyệt đối; 1 = cho trùng thoải mái)
    const dupRatio = Math.min(1, Math.max(0, opts.dupRatio != null ? opts.dupRatio : 0));

    if (!budget || budget < minOrder)
      return { success: false, error: `Ngân sách ${fmt(budget)} nhỏ hơn giá trị tối thiểu 1 đơn ${fmt(minOrder)}.`, purchase_orders: [] };

    // 1) Pool vật tư đủ điều kiện — HỖ TRỢ NHIỀU NCC & NHIỀU NHÓM (Debug 1)
    const nccSet  = Array.isArray(opts.id_ncc)  ? opts.id_ncc.filter(Boolean)
                  : (opts.id_ncc  ? [opts.id_ncc]  : []);
    const nhomSet = Array.isArray(opts.id_nhom) ? opts.id_nhom.filter(Boolean)
                  : (opts.id_nhom ? [opts.id_nhom] : []);

    // === LỌC TRÙNG TRONG KỲ: lấy mã hàng đã có đơn (không-hủy) trong CÙNG tháng ===
    const purchasedThisMonth = await getMaHangPurchasedInMonth(thang_nam);
    // === CẢNH BÁO KỲ TRƯỚC: map ma_hang -> lần mua gần nhất ở các tháng TRƯỚC ===
    const lastBuyMap = await getLastPurchaseBeforeMonth(thang_nam);

    let pool = await listData();
    const warnItems = [];        // cảnh báo chu kỳ
    const blockedByDup = [];     // các mã bị loại do trùng kỳ trước (ứng viên cho "tỷ lệ cho phép trùng")
    pool = pool.filter(it => {
      if (nccSet.length  && !nccSet.includes(C.GROUP_TO_NCC[it.ma_nhom])) return false;
      if (nhomSet.length && !nhomSet.includes(it.id_nhom)) return false;
      if (opts.onlyDeHuHong && it.muc_do_hu_hong !== 'Dễ hư hỏng') return false;
      if (it.don_gia <= 0) return false;
      // (a) Loại trừ cứng: đã có đơn trong CÙNG tháng này -> không lấy lại
      if (purchasedThisMonth.has(it.ma_hang)) return false;

      // (b) Tra soát các KỲ TRƯỚC: nếu đã mua mà CHƯA tới chu kỳ thay thế tối thiểu -> LOẠI,
      //     TRỪ KHI là hàng "Dễ hư hỏng" (được mua lại tự do).
      const last = lastBuyMap[it.ma_hang];
      const ckMin = (it._ck_min != null) ? it._ck_min : (parseChuKy(it.chu_ky_thay_the)[0] || 0);
      const deHuHong = it.muc_do_hu_hong === 'Dễ hư hỏng';
      if (last && !deHuHong) {
        const months = monthsBetweenYM(last.thang, thang_nam);
        if (ckMin > 0 && months < ckMin) {
          // Mặt hàng "trùng kỳ trước, chưa tới chu kỳ" -> tạm loại; có thể được nới theo dupRatio
          blockedByDup.push(it);
          warnItems.push(`⏳ ${it.ten_hang_hoa} (${it.ma_hang}): mua kỳ ${last.thang}, chu kỳ tối thiểu ${ckMin} tháng — mới ${months} tháng. Đã loại để tránh trùng.`);
          return false;
        }
      }
      return true;
    });

    // (c) Nới "tỷ lệ cho phép trùng": cho phép thêm lại một phần mặt hàng đã bị loại do trùng kỳ trước
    if (dupRatio > 0 && blockedByDup.length) {
      const allowCount = Math.round(blockedByDup.length * dupRatio);
      if (allowCount > 0) {
        // ưu tiên cho phép lại các mặt hàng gần tới chu kỳ nhất (months/ckMin lớn nhất)
        const ranked = blockedByDup.map(it => {
          const last = lastBuyMap[it.ma_hang];
          const months = monthsBetweenYM(last.thang, thang_nam);
          const ckMin = (it._ck_min != null) ? it._ck_min : (parseChuKy(it.chu_ky_thay_the)[0] || 1);
          return { it, ratio: months / Math.max(1, ckMin) };
        }).sort((a, b) => b.ratio - a.ratio).slice(0, allowCount);
        ranked.forEach(x => pool.push(x.it));
        warnItems.push(`🔁 Đã cho phép trùng lại ${ranked.length}/${blockedByDup.length} mặt hàng theo tỷ lệ ${(dupRatio * 100).toFixed(0)}%.`);
      }
    }
    if (!pool.length) return { success: false, error: 'Không có vật tư phù hợp (có thể tất cả đã lên đơn trong kỳ này).', purchase_orders: [] };

    // 2) Gom pool theo NCC (mỗi PO chỉ 1 NCC — Supplier Isolation)
    const poolByNcc = {};
    pool.forEach(it => {
      const ncc = C.GROUP_TO_NCC[it.ma_nhom];
      (poolByNcc[ncc] = poolByNcc[ncc] || []).push(it);
    });

    // 3) Số đơn tối đa khả thi theo ngân sách (mỗi đơn >= minOrder)
    const targetPerPO = Math.round(maxOrder * fillRatio); // giá trị nhắm mỗi đơn
    const maxPOByBudget = Math.floor(budget / minOrder);
    if (maxPOByBudget < 1)
      return { success: false, error: 'Ngân sách không đủ tạo dù một đơn.', purchase_orders: [] };

    const nccKeys = Object.keys(poolByNcc);
    const purchase_orders = [];
    const warnings_general = [];
    let remaining = budget;
    let nccIdx = 0;
    const usedMaHang = new Set(); // Mỗi mã hàng chỉ dùng 1 lần trong CẢ đợt (chống trùng giữa các đơn)

    // 4) Vòng lặp tạo đơn cho tới khi hết ngân sách / không thể tạo thêm
    let guard = 0;
    while (remaining >= minOrder && guard < maxPOByBudget + nccKeys.length + 5) {
      guard++;
      const ncc = nccKeys[nccIdx % nccKeys.length];
      nccIdx++;
      const items = (poolByNcc[ncc] || []).filter(it => !usedMaHang.has(it.ma_hang));
      // Nếu tất cả NCC đều đã cạn vật tư chưa-dùng -> dừng
      const conHang = nccKeys.some(k => (poolByNcc[k] || []).some(it => !usedMaHang.has(it.ma_hang)));
      if (!conHang) break;
      if (!items.length) continue;
      // mục tiêu cho đơn này: không vượt phần ngân sách còn lại, không vượt max
      const cap = Math.min(maxOrder, remaining);
      if (cap < minOrder) break;
      const aim = Math.min(targetPerPO, cap);
      const lines = packOnePO(items, aim, minOrder, cap, usedMaHang);
      if (!lines.length) {
        // NCC này đã hết vật tư chưa-dùng đủ tạo đơn -> loại khỏi vòng xoay để tránh lặp vô ích
        poolByNcc[ncc] = [];
        continue;
      }
      const val = lines.reduce((a, l) => a + l.thanh_tien, 0);
      if (val < minOrder) {
        // không đạt min -> bỏ qua NCC này lần này
        continue;
      }
      const code = await buildPoCode(thang_nam, ncc);
      remaining -= val;
      purchase_orders.push({
        id_don_hang: uuid(), ma_don_hang: code, id_ncc: ncc,
        gia_tri_don_hang: val, trang_thai: C.PO_STATUS.NHAP, ghi_chu: '[Tự động sinh]',
        _lines: lines, warnings: [],
      });
    }

    if (!purchase_orders.length)
      return { success: false, error: 'Không thể tạo đơn với ràng buộc hiện tại (thử giảm min hoặc tăng ngân sách).', purchase_orders: [] };

    const total_allocated = budget - remaining;
    if (remaining >= minOrder)
      warnings_general.push(`Còn dư ${fmt(remaining)} chưa phân bổ (đủ tạo thêm đơn nhưng pool vật tư hạn chế).`);

    // Gộp cảnh báo chu kỳ (kỳ trước) — gọn, tối đa 10 dòng
    if (warnItems.length) {
      warnings_general.push(`Có ${warnItems.length} mặt tư mua sớm hơn chu kỳ thay thế (so với kỳ trước):`);
      warnItems.slice(0, 10).forEach(w => warnings_general.push(w));
      if (warnItems.length > 10) warnings_general.push(`… và ${warnItems.length - 10} mặt hàng khác.`);
    }

    return {
      success: true, purchase_orders, warnings_general,
      budget_utilization: { total_allocated, budget_limit: budget, exceeded: false },
    };
  }

  // Đóng gói 1 PO: chọn vật tư & cân số lượng nguyên để giá trị ~ aim, trong [floorMin, cap].
  // KHÔNG random. Mỗi mã hàng chỉ dùng 1 lần trong cả đợt nhờ Set "used".
  // Quy tắc chọn (deterministic):
  //   1) Bỏ qua mã đã dùng (used) và mã có giá > cap.
  //   2) Ưu tiên đa dạng NHÓM HÀNG (mỗi đơn cố gắng gồm nhiều nhóm khác nhau).
  //   3) Trong cùng nhóm, ưu tiên đơn giá lớn trước để lấp đầy nhanh, gọn dòng.
  function packOnePO(items, aim, floorMin, cap, used) {
    used = used || new Set();
    // Lọc ứng viên: chưa dùng, giá hợp lệ
    let cands = items.filter(it => !used.has(it.ma_hang) && it.don_gia > 0 && it.don_gia <= cap);
    if (!cands.length) return [];

    // Sắp xếp ỔN ĐỊNH: theo nhóm (id_nhom) rồi đơn giá giảm dần; trong cùng giá thì theo mã (cho cố định)
    cands = cands.sort((a, b) =>
      String(a.id_nhom).localeCompare(String(b.id_nhom)) ||
      (b.don_gia - a.don_gia) ||
      String(a.ma_hang).localeCompare(String(b.ma_hang))
    );

    const lines = [];
    const groupsUsed = new Set();
    let sum = 0;
    const wantLines = 5; // mục tiêu ~5 dòng/đơn (sẽ dừng sớm nếu đã đạt aim)

    // Lượt 1: mỗi nhóm lấy tối đa 1 món (đa dạng nhóm), đơn giá cao trước
    for (const it of cands) {
      if (lines.length >= wantLines || sum >= aim) break;
      if (groupsUsed.has(it.id_nhom)) continue;
      const price = it.don_gia;
      const room = Math.min(aim, cap) - sum;
      if (room < price) continue;
      let qty = Math.max(1, Math.floor(room / price / Math.max(1, wantLines - lines.length)));
      while (qty > 1 && (sum + qty * price) > cap) qty--;
      if (qty < 1) qty = 1;
      const thanh_tien = qty * price;
      if (sum + thanh_tien > cap) continue;
      lines.push({
        ma_hang: it.ma_hang, ten_hang_hoa: it.ten_hang_hoa, dvt: it.dvt,
        id_nhom: it.id_nhom, phan_loai_nhom_hang: it.phan_loai_nhom_hang, ma_nhom: it.ma_nhom,
        so_luong: qty, don_gia_thuc_te: price, thanh_tien,
      });
      used.add(it.ma_hang);
      groupsUsed.add(it.id_nhom);
      sum += thanh_tien;
    }

    // Lượt 2: nếu chưa đạt aim, bổ sung thêm bất kỳ món chưa dùng (kể cả trùng nhóm)
    for (const it of cands) {
      if (sum >= aim || lines.length >= wantLines + 3) break;
      if (used.has(it.ma_hang)) continue;
      const price = it.don_gia;
      const room = Math.min(aim, cap) - sum;
      if (room < price) continue;
      let qty = 1;
      while ((sum + (qty + 1) * price) <= Math.min(aim, cap)) qty++;
      const thanh_tien = qty * price;
      if (sum + thanh_tien > cap) continue;
      lines.push({
        ma_hang: it.ma_hang, ten_hang_hoa: it.ten_hang_hoa, dvt: it.dvt,
        id_nhom: it.id_nhom, phan_loai_nhom_hang: it.phan_loai_nhom_hang, ma_nhom: it.ma_nhom,
        so_luong: qty, don_gia_thuc_te: price, thanh_tien,
      });
      used.add(it.ma_hang);
      sum += thanh_tien;
    }

    // Nếu chưa đạt min: tăng số lượng dòng đầu tiên cho tới khi đạt min (không vượt cap)
    if (sum < floorMin && lines.length) {
      const l0 = lines[0];
      while (sum < floorMin && (sum + l0.don_gia_thuc_te) <= cap) {
        l0.so_luong += 1; l0.thanh_tien += l0.don_gia_thuc_te; sum += l0.don_gia_thuc_te;
      }
    }

    // Không đạt min -> trả mảng rỗng VÀ nhả lại các mã đã dùng (để đợt sau còn dùng được)
    if (sum < floorMin) {
      lines.forEach(l => used.delete(l.ma_hang));
      return [];
    }
    return lines;
  }

  /* ====================================================================
   *  19. AUTO-GENERATOR bằng AI (NVIDIA NIM). Fallback -> thuật toán.
   * ==================================================================== */
  async function autoGeneratePOsAI(params) {
    const key = await getSetting('nvidia_key');
    if (!key) {
      const r = await autoGeneratePOs(params);
      r.warnings_general = r.warnings_general || [];
      r.warnings_general.unshift('Chưa có NVIDIA key — đã dùng thuật toán nội bộ.');
      return r;
    }
    try {
      const _ncc  = Array.isArray(params.opts?.id_ncc)  ? params.opts.id_ncc.filter(Boolean)  : (params.opts?.id_ncc  ? [params.opts.id_ncc]  : []);
      const _nhom = Array.isArray(params.opts?.id_nhom) ? params.opts.id_nhom.filter(Boolean) : (params.opts?.id_nhom ? [params.opts.id_nhom] : []);
      const _bought = await getMaHangPurchasedInMonth(params.thang_nam);
      const pool = (await listData())
        .filter(it => (!_ncc.length  || _ncc.includes(C.GROUP_TO_NCC[it.ma_nhom]))
                   && (!_nhom.length || _nhom.includes(it.id_nhom))
                   && it.don_gia > 0
                   && !_bought.has(it.ma_hang))
        .slice(0, 120)
        .map(it => ({ ma_hang: it.ma_hang, ten: it.ten_hang_hoa, dvt: it.dvt, gia: it.don_gia,
          ncc: C.GROUP_TO_NCC[it.ma_nhom], nhom: it.phan_loai_nhom_hang, id_nhom: it.id_nhom }));

      const payload = {
        task: 'Phân bổ ngân sách thành nhiều PO. Mỗi PO 1 NCC, giá trị trong [min,max], số lượng nguyên dương, tổng <= budget.',
        thang_nam: params.thang_nam, budget: params.budget,
        min_order: params.minOrder ?? C.ORDER_CONSTRAINTS.MIN_ORDER,
        max_order: params.maxOrder ?? C.ORDER_CONSTRAINTS.MAX_ORDER,
        ncc_mapping: C.GROUP_TO_NCC, available_items: pool,
        output_schema: '{"purchase_orders":[{"id_ncc":"NCCxxx","items":[{"ma_hang":"","so_luong":1,"don_gia_thuc_te":0}]}]}',
      };
      const ai = await nvidiaOptimize(payload, key);
      const itemMap = Object.fromEntries((await listData()).map(d => [d.ma_hang, d]));
      const purchase_orders = [];
      for (const po of (ai.purchase_orders || [])) {
        const lines = (po.items || []).map(x => {
          const d = itemMap[x.ma_hang]; if (!d) return null;
          const qty = Math.max(1, Math.round(x.so_luong || 1));
          const price = x.don_gia_thuc_te || d.don_gia;
          return { ma_hang: d.ma_hang, ten_hang_hoa: d.ten_hang_hoa, dvt: d.dvt,
            id_nhom: d.id_nhom, phan_loai_nhom_hang: d.phan_loai_nhom_hang, ma_nhom: d.ma_nhom,
            so_luong: qty, don_gia_thuc_te: price, thanh_tien: qty * price };
        }).filter(Boolean);
        if (!lines.length) continue;
        const val = lines.reduce((a, l) => a + l.thanh_tien, 0);
        const code = await buildPoCode(params.thang_nam, po.id_ncc);
        const w = [];
        const minO = params.minOrder ?? C.ORDER_CONSTRAINTS.MIN_ORDER;
        const maxO = params.maxOrder ?? C.ORDER_CONSTRAINTS.MAX_ORDER;
        if (val < minO) w.push(`Đơn dưới tối thiểu (${fmt(val)}).`);
        if (val > maxO) w.push(`Đơn vượt tối đa (${fmt(val)}).`);
        purchase_orders.push({ id_don_hang: uuid(), ma_don_hang: code, id_ncc: po.id_ncc,
          gia_tri_don_hang: val, trang_thai: C.PO_STATUS.NHAP, ghi_chu: '[AI sinh]', _lines: lines, warnings: w });
      }
      if (!purchase_orders.length) throw new Error('AI không trả về đơn hợp lệ');
      const total = purchase_orders.reduce((a, p) => a + p.gia_tri_don_hang, 0);
      return { success: true, purchase_orders,
        warnings_general: total > params.budget ? [`Tổng AI ${fmt(total)} vượt ngân sách.`] : [],
        budget_utilization: { total_allocated: total, budget_limit: params.budget, exceeded: total > params.budget } };
    } catch (e) {
      const r = await autoGeneratePOs(params);
      r.warnings_general = r.warnings_general || [];
      r.warnings_general.unshift('AI lỗi (' + e.message + ') — đã dùng thuật toán nội bộ.');
      return r;
    }
  }

  /* ====================================================================
   *  20. CRUD NHÀ CUNG CẤP
   * ==================================================================== */
  async function saveNCC(o) {
    if (!o.id_ncc) {
      // sinh mã NCC kế tiếp
      const all = await getAll(S.NCC);
      let max = 0; all.forEach(n => { const m = /NCC(\d+)/.exec(n.id_ncc); if (m) max = Math.max(max, +m[1]); });
      o.id_ncc = 'NCC' + String(max + 1).padStart(3, '0');
    }
    return put(S.NCC, o);
  }
  async function deleteNCC(id) {
    const dhs = await getByIndex(S.DON_HANG, 'id_ncc', id);
    const active = dhs.filter(d => d.trang_thai !== C.PO_STATUS.DA_HUY);
    if (active.length) throw new Error(`Không thể xóa: NCC đang có ${active.length} đơn hàng hiệu lực.`);
    return del(S.NCC, id);
  }

  /* -------------------- EXPORT API -------------------- */
  return {
    openDB, seedIfEmpty, uuid, nowStr, todayStr, fmt,
    parseChuKy, parseGiaThiTruong, enrichItem,
    // data gốc
    listData, getDataItem, saveDataItem, deleteDataItem, listNCC, listNhom,
    getNhom, saveNhom, deleteNhom, countItemsByNhom,
    // công trình
    saveCongTrinh, listCongTrinh, getCongTrinh, delCongTrinh,
    // kế hoạch
    saveKeHoach, listKeHoach, getKeHoach, delKeHoach,
    // đơn hàng
    saveDonHang, listDonHang, getDonHang, listDonHangByKeHoach,
    listChiTietByDon, saveChiTiet, deleteDonHang, changePoStatus,
    buildPoCode, checkDuplicate,
    // tiện ích nội bộ cho UI nâng cao (Debug 3 / import)
    _store: S, _del: del, _clear: clearStore, _bulkPut: bulkPut, _get: get, _getAll: getAll,
    getMaHangPurchasedInMonth, getLastPurchaseBeforeMonth, monthsBetweenYM,
    // PO engine
    buildPurchaseOrders, suggestSubstitutes, suggestFillItems,
    // thanh toán
    saveThanhToan, listThanhToanByDon, congNoByDon,
    getThanhToan, deleteThanhToan, recalcCongNoStatus,
    // settings + AI
    setSetting, getSetting, aiStatus, nvidiaOptimize, listGeminiModels,
    geminiGenerate, analyzePurchaseOrders, suggestNewItemFields,
    // backup
    exportBackup, importBackup,
    
    // auto-generator
    autoGeneratePOs, autoGeneratePOsAI,
    // CRUD NCC
    saveNCC, deleteNCC,
  };
})();
