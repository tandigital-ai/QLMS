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
  const listNCC = () => getAll(S.NCC);
  const listNhom = () => getAll(S.NHOM);

  /* -------------------- 9. CRUD ĐƠN HÀNG + CHI TIẾT -------------------- */
  async function saveDonHang(po) {
    if (!po.id_don_hang) { po.id_don_hang = uuid(); po.ngay_tao = nowStr(); }
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
    await put(S.THANH_TOAN, tt);
    // tính lại công nợ & cập nhật trạng thái
    const po = await getDonHang(tt.id_don_hang);
    const list = await getByIndex(S.THANH_TOAN, 'id_don_hang', tt.id_don_hang);
    const paid = list.reduce((a, b) => a + (Number(b.so_tien_thanh_toan) || 0), 0);
    if (paid >= po.gia_tri_don_hang) {
      if (C.PO_FLOW[po.trang_thai]?.includes(C.PO_STATUS.DA_THANH_TOAN) || po.trang_thai === C.PO_STATUS.TT_MOT_PHAN)
        await changePoStatusForce(po.id_don_hang, C.PO_STATUS.DA_THANH_TOAN);
    } else if (paid > 0 && po.trang_thai === C.PO_STATUS.DA_XUAT_HD) {
      await changePoStatusForce(po.id_don_hang, C.PO_STATUS.TT_MOT_PHAN);
    }
    return { paid, remaining: po.gia_tri_don_hang - paid };
  }
  async function changePoStatusForce(id, st) {
    const po = await getDonHang(id); po.trang_thai = st; return saveDonHang(po);
  }
  const listThanhToanByDon = (id) => getByIndex(S.THANH_TOAN, 'id_don_hang', id);
  async function congNoByDon(id) {
    const po = await getDonHang(id);
    const list = await listThanhToanByDon(id);
    const paid = list.reduce((a, b) => a + (Number(b.so_tien_thanh_toan) || 0), 0);
    return { gia_tri: po.gia_tri_don_hang, paid, remaining: po.gia_tri_don_hang - paid };
  }

  /* -------------------- 14. SETTINGS (API key...) -------------------- */
  async function setSetting(key, value) { return put(S.SETTINGS, { key, value }); }
  async function getSetting(key) { const r = await get(S.SETTINGS, key); return r ? r.value : null; }

  /* -------------------- 15. TÍCH HỢP AI (tùy chọn) -------------------- */
  async function geminiRerank(base, candidates, key) {
    const prompt = `Bạn là chuyên gia mua sắm vật tư cấp thoát nước. Mặt hàng cần thay thế: "${base.ten_hang_hoa}" (mục đích: ${base.muc_dich_su_dung}, đơn giá ${base.don_gia}).
Danh sách ứng viên (JSON): ${JSON.stringify(candidates.map(c => ({ ma_hang: c.ma_hang, ten: c.ten_hang_hoa, gia: c.don_gia, muc_dich: c.muc_dich_su_dung })))}.
Hãy chọn và sắp xếp tối đa 3 mã phù hợp nhất. CHỈ trả JSON mảng các ma_hang, ví dụ ["X","Y"].`;
    const url = `${C.AI.GEMINI.ENDPOINT}/${C.AI.GEMINI.MODEL}:generateContent?key=${encodeURIComponent(key)}`;
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
    const n = await getSetting('nvidia_key');
    return { gemini: !!g, nvidia: !!n, mode: (g || n) ? 'Cloud AI' : 'Nội bộ' };
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

    if (!budget || budget < minOrder)
      return { success: false, error: `Ngân sách ${fmt(budget)} nhỏ hơn giá trị tối thiểu 1 đơn ${fmt(minOrder)}.`, purchase_orders: [] };

    // 1) Pool vật tư đủ điều kiện — HỖ TRỢ NHIỀU NCC & NHIỀU NHÓM (Debug 1)
    const nccSet  = Array.isArray(opts.id_ncc)  ? opts.id_ncc.filter(Boolean)
                  : (opts.id_ncc  ? [opts.id_ncc]  : []);
    const nhomSet = Array.isArray(opts.id_nhom) ? opts.id_nhom.filter(Boolean)
                  : (opts.id_nhom ? [opts.id_nhom] : []);
    let pool = await listData();
    pool = pool.filter(it => {
      if (nccSet.length  && !nccSet.includes(C.GROUP_TO_NCC[it.ma_nhom])) return false;
      if (nhomSet.length && !nhomSet.includes(it.id_nhom)) return false;
      if (opts.onlyDeHuHong && it.muc_do_hu_hong !== 'Dễ hư hỏng') return false;
      return it.don_gia > 0;
    });

    if (!pool.length) return { success: false, error: 'Không có vật tư phù hợp bộ lọc đã chọn.', purchase_orders: [] };

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

    // 4) Vòng lặp tạo đơn cho tới khi hết ngân sách / không thể tạo thêm
    let guard = 0;
    while (remaining >= minOrder && guard < maxPOByBudget + nccKeys.length + 5) {
      guard++;
      const ncc = nccKeys[nccIdx % nccKeys.length];
      nccIdx++;
      const items = poolByNcc[ncc];
      if (!items || !items.length) {
        if (nccIdx % nccKeys.length === 0) break; // đã quay 1 vòng không tạo được gì
        continue;
      }
      // mục tiêu cho đơn này: không vượt phần ngân sách còn lại, không vượt max
      const cap = Math.min(maxOrder, remaining);
      if (cap < minOrder) break;
      const aim = Math.min(targetPerPO, cap);
      const lines = packOnePO(items, aim, minOrder, cap);
      if (!lines.length) { continue; }
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

    return {
      success: true, purchase_orders, warnings_general,
      budget_utilization: { total_allocated, budget_limit: budget, exceeded: false },
    };
  }

  // Đóng gói 1 PO: chọn vật tư & cân số lượng nguyên để giá trị ~ aim, trong [floorMin, cap]
  function packOnePO(items, aim, floorMin, cap) {
    // xáo trộn nhẹ để các đơn khác nhau, ưu tiên đa dạng nhóm
    const shuffled = items.slice().sort(() => Math.random() - 0.5);
    const lines = [];
    let sum = 0;
    // chọn 3–6 mặt hàng
    const wantLines = 3 + Math.floor(Math.random() * 4);
    for (const it of shuffled) {
      if (lines.length >= wantLines) break;
      if (sum >= aim) break;
      const price = it.don_gia;
      if (price <= 0 || price > cap) continue;
      const room = Math.min(aim, cap) - sum;
      if (room < price) continue;
      let qty = Math.max(1, Math.round(room / price / Math.max(1, wantLines - lines.length)));
      // không để 1 dòng vượt cap
      while (qty > 1 && (sum + qty * price) > cap) qty--;
      if (qty < 1) qty = 1;
      const thanh_tien = qty * price;
      if (sum + thanh_tien > cap) continue;
      lines.push({
        ma_hang: it.ma_hang, ten_hang_hoa: it.ten_hang_hoa, dvt: it.dvt,
        id_nhom: it.id_nhom, phan_loai_nhom_hang: it.phan_loai_nhom_hang, ma_nhom: it.ma_nhom,
        so_luong: qty, don_gia_thuc_te: price, thanh_tien,
      });
      sum += thanh_tien;
    }
    // nếu chưa đạt min, tăng số lượng dòng đầu tiên cho tới khi đạt min (không vượt cap)
    if (sum < floorMin && lines.length) {
      const l0 = lines[0];
      while (sum < floorMin && (sum + l0.don_gia_thuc_te) <= cap) {
        l0.so_luong += 1; l0.thanh_tien += l0.don_gia_thuc_te; sum += l0.don_gia_thuc_te;
      }
    }
    if (sum < floorMin) return []; // không đạt min -> bỏ
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
      const pool = (await listData())
        .filter(it => (!_ncc.length  || _ncc.includes(C.GROUP_TO_NCC[it.ma_nhom]))
                   && (!_nhom.length || _nhom.includes(it.id_nhom))
                   && it.don_gia > 0)
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
    listData, getDataItem, listNCC, listNhom,
    // công trình
    saveCongTrinh, listCongTrinh, getCongTrinh, delCongTrinh,
    // kế hoạch
    saveKeHoach, listKeHoach, getKeHoach, delKeHoach,
    // đơn hàng
    saveDonHang, listDonHang, getDonHang, listDonHangByKeHoach,
    listChiTietByDon, saveChiTiet, deleteDonHang, changePoStatus,
    buildPoCode, checkDuplicate,
    // PO engine
    buildPurchaseOrders, suggestSubstitutes, suggestFillItems,
    // thanh toán
    saveThanhToan, listThanhToanByDon, congNoByDon,
    // settings + AI
    setSetting, getSetting, aiStatus, nvidiaOptimize,
    // backup
    exportBackup, importBackup,
    // tiện ích nội bộ cho UI nâng cao (Debug 3 / import)
    _del: del, _clear: clearStore, _bulkPut: bulkPut, _get: get, _getAll: getAll, _store: S, 
    // auto-generator
    autoGeneratePOs, autoGeneratePOsAI,
    // CRUD NCC
    saveNCC, deleteNCC,
  };
})();
