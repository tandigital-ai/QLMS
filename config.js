/* =====================================================================
 * config.js — Cấu hình hệ thống, ánh xạ NCC, hằng số nghiệp vụ
 * ===================================================================== */
window.CONFIG = (function () {

  // ---- Ràng buộc giá trị đơn hàng (VNĐ) ----
  const ORDER_CONSTRAINTS = {
    MIN_ORDER: 3_000_000,   // Dưới mức này -> cảnh báo & gợi ý bổ sung
    MAX_ORDER: 4_500_000,  // Vượt mức này -> tự động tách PO
  };

  // ---- Ánh xạ Nhóm hàng -> Nhà cung cấp ----
  // LƯU Ý R-01: KHA dùng chung 4 nhóm nghiệp vụ -> luôn map qua ma_nhom CHUẨN HÓA,
  // nhưng khi lọc/đối chiếu phải dùng id_nhom / ten_nhom.
  const GROUP_TO_NCC = {
    CDM: 'NCC001',
    DCS: 'NCC002',
    CTN: 'NCC003',
    PTX: 'NCC004',
    BHL: 'NCC005',
    ATG: 'NCC006',
    KHA: 'NCC006',
    VTP: 'NCC006',
    XDG: 'NCC006',
  };

  // ---- Danh mục 6 Nhà cung cấp ----
  const NHA_CUNG_CAP = [
    { id_ncc: 'NCC001', ten_ncc: 'Cơ Điện - Máy Móc', nhom_phu_trach: ['CDM'], dien_thoai: '', dia_chi: 'TP.HCM' },
    { id_ncc: 'NCC002', ten_ncc: 'Điện - Chiếu Sáng', nhom_phu_trach: ['DCS'], dien_thoai: '', dia_chi: 'TP.HCM' },
    { id_ncc: 'NCC003', ten_ncc: 'Đường Ống Cấp Thoát Nước', nhom_phu_trach: ['CTN'], dien_thoai: '', dia_chi: 'TP.HCM' },
    { id_ncc: 'NCC004', ten_ncc: 'Phụ Tùng Xe - Cơ Khí', nhom_phu_trach: ['PTX'], dien_thoai: '', dia_chi: 'TP.HCM' },
    { id_ncc: 'NCC005', ten_ncc: 'Bảo Hộ Lao Động An', nhom_phu_trach: ['BHL'], dien_thoai: '', dia_chi: 'TP.HCM' },
    { id_ncc: 'NCC006', ten_ncc: 'Vật Tư Tổng Hợp', nhom_phu_trach: ['ATG','KHA','VTP','XDG'], dien_thoai: '', dia_chi: 'TP.HCM' },
  ];

  // ---- 12 Nhóm hàng (DANH_MUC_NHOM) ----
  // ma_nhom KHA xuất hiện ở 4 dòng -> phân biệt bằng id_nhom (unique).
  const DANH_MUC_NHOM = [
    { id_nhom: 'NH01', ma_nhom: 'CDM', ten_nhom: 'Cơ điện - Máy móc' },
    { id_nhom: 'NH02', ma_nhom: 'DCS', ten_nhom: 'Điện - Chiếu sáng' },
    { id_nhom: 'NH03', ma_nhom: 'CTN', ten_nhom: 'Đường ống - Cấp thoát nước' },
    { id_nhom: 'NH04', ma_nhom: 'PTX', ten_nhom: 'Phụ tùng xe - Cơ khí' },
    { id_nhom: 'NH05', ma_nhom: 'BHL', ten_nhom: 'Bảo hộ lao động' },
    { id_nhom: 'NH06', ma_nhom: 'ATG', ten_nhom: 'An toàn giao thông' },
    { id_nhom: 'NH07', ma_nhom: 'KHA', ten_nhom: 'Dụng cụ cầm tay' },
    { id_nhom: 'NH08', ma_nhom: 'KHA', ten_nhom: 'Dụng cụ đo lường' },
    { id_nhom: 'NH09', ma_nhom: 'KHA', ten_nhom: 'Nạo vét - Vệ sinh' },
    { id_nhom: 'NH10', ma_nhom: 'KHA', ten_nhom: 'Phụ kiện máy cắt' },
    { id_nhom: 'NH11', ma_nhom: 'VTP', ten_nhom: 'Vật tư phụ' },
    { id_nhom: 'NH12', ma_nhom: 'XDG', ten_nhom: 'Xây dựng' },
  ];

  // ---- Trạng thái & vòng đời PO ----
  const PO_STATUS = {
    NHAP: 'Nháp',
    DA_GUI: 'Đã gửi đơn',
    DA_CHAP_NHAN: 'Đã chấp nhận đơn',
    DA_GIAO: 'Đã giao hàng',
    DA_XUAT_HD: 'Đã xuất hóa đơn',
    TT_MOT_PHAN: 'Thanh toán một phần',
    DA_THANH_TOAN: 'Đã thanh toán',
    DA_HUY: 'Đã hủy',
  };
    // Chuyển trạng thái hợp lệ (tuần tự)
  const PO_FLOW = {
    'Nháp':                ['Đã gửi đơn', 'Đã hủy'],
    'Đã gửi đơn':          ['Đã chấp nhận đơn', 'Đã hủy'],
    'Đã chấp nhận đơn':    ['Đã giao hàng'],
    'Đã giao hàng':        ['Đã xuất hóa đơn'],
    'Đã xuất hóa đơn':     ['Đã thanh toán'], // 'Thanh toán một phần' set tự động bởi module thanh toán
    'Thanh toán một phần': ['Đã thanh toán'],
    'Đã thanh toán':       [],
    'Đã hủy':              [],
  };
  // Từ trạng thái này trở lên TUYỆT ĐỐI không được xóa (R-04 / ràng buộc cứng)
  const PO_NO_DELETE_FROM = ['Đã giao hàng', 'Đã xuất hóa đơn', 'Thanh toán một phần', 'Đã thanh toán'];
  // Chỉ được hủy từ các trạng thái này
  const PO_CANCELLABLE_FROM = ['Nháp', 'Đã gửi đơn'];

  // ---- Trạng thái Kế hoạch ----
  const PLAN_STATUS = {
    NHAP: 'Nháp',
    DA_DUYET: 'Đã duyệt',
    DANG_THUC_HIEN: 'Đang thực hiện',
    HOAN_TAT: 'Hoàn tất',
  };

  // ---- Trạng thái Công trình ----
  const PROJECT_STATUS = ['Đang thi công', 'Tạm dừng', 'Hoàn thành'];

  // ---- Cấu hình IndexedDB (tên DB / version / object stores) ----
  // Mọi nơi truy cập store PHẢI dùng đúng các hằng STORE.* này.
  const DB = {
    NAME: 'QLMS_VATTU_DB',
    VERSION: 1,
    STORE: {
      DATA:        'DATA',          // 300 mặt hàng gốc (keyPath: ma_hang)
      NHOM:        'DANH_MUC_NHOM', // keyPath: id_nhom
      NCC:         'NHA_CUNG_CAP',  // keyPath: id_ncc
      CONG_TRINH:  'CONG_TRINH',    // keyPath: id_cong_trinh
      KE_HOACH:    'KE_HOACH_MUA_SAM', // keyPath: id_ke_hoach
      DON_HANG:    'DON_DAT_HANG',  // keyPath: id_don_hang
      CHI_TIET:    'CHI_TIET_DON_HANG', // keyPath: id_chi_tiet
      THANH_TOAN:  'THANH_TOAN',    // keyPath: id_thanh_toan
      SEQ:         'SEQUENCE',      // bộ đếm STT mã PO theo (thang_nam + ncc), keyPath: key
      SETTINGS:    'SETTINGS',      // cấu hình runtime (API key...), keyPath: key
    },
  };

  // ---- Cấu hình AI (tùy chọn — có fallback nội bộ) ----
  const AI = {
    GEMINI: {
      ENABLED_BY_KEY: true,
      MODEL: 'gemini-2.0-flash',
      ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
    NVIDIA: {
      ENABLED_BY_KEY: true,
      MODEL: 'meta/llama-3.3-70b-instruct',
      ENDPOINT: 'https://integrate.api.nvidia.com/v1/chat/completions',
    },
  };

  // ---- Hằng số nghiệp vụ AI gợi ý thay thế ----
  const SUBSTITUTE = {
    MAX_SUGGESTIONS: 3,
    PRICE_TOLERANCE: 0.20, // ±20% đơn giá
  };

  // ---- Tên cột chuẩn cho Export Excel (R: phải nhất quán mọi nơi) ----
  const EXCEL_COLS = {
    PO_DETAIL: ['STT', 'Mã hàng', 'Tên hàng hóa', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Ghi chú'],
    REPORT_NCC: ['STT', 'Mã NCC', 'Tên nhà cung cấp', 'Số đơn hàng', 'Tổng giá trị (VNĐ)', 'Đã thanh toán', 'Công nợ còn lại'],
    REPORT_CT:  ['STT', 'Mã công trình', 'Tên công trình', 'Số kế hoạch', 'Ngân sách', 'Đã chi', 'Còn lại', '% Sử dụng'],
  };

  return {
    ORDER_CONSTRAINTS, GROUP_TO_NCC, NHA_CUNG_CAP, DANH_MUC_NHOM,
    PO_STATUS, PO_FLOW, PO_NO_DELETE_FROM, PO_CANCELLABLE_FROM,
    PLAN_STATUS, PROJECT_STATUS, DB, AI, SUBSTITUTE, EXCEL_COLS,
  };
})();
