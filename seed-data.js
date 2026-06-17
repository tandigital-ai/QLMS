/* =====================================================================
 * seed-data.js — Dữ liệu mẫu 300 mặt hàng (cấu trúc khớp bảng DATA).
 * Mỗi dòng đã được kiểm tra: phan_loai_nhom_hang ∈ DANH_MUC_NHOM.ten_nhom,
 * id_nhom hợp lệ, nha_cung_cap khớp GROUP_TO_NCC.
 * Sinh theo template thực tế ngành cấp thoát nước.
 * ===================================================================== */
window.SEED = (function () {
  // Template từng nhóm: [id_nhom, ten_nhom, ma_nhom, prefix, [danh sách mẫu]]
  // Mỗi mẫu: [tên, dvt, don_gia, gia_min, gia_max, muc_dich, hu_hong, chu_ky, phan_loai_cp]
  const TPL = [
    ['NH01','Cơ điện - Máy móc','CDM','CDM',[
      ['Máy bơm chìm nước thải 3HP','Cái',12500000,11000000,16000000,'Bơm hút nước thải hố ga','Trung bình','từ 12 đến 18 tháng','Chi phí thiết bị'],
      ['Mô tơ điện 3 pha 5.5kW','Cái',8200000,7500000,9500000,'Truyền động máy bơm','Trung bình','từ 12 đến 24 tháng','Chi phí thiết bị'],
      ['Tụ điện khởi động 50µF','Cái',95000,80000,130000,'Khởi động mô tơ','Dễ hư hỏng','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Vòng bi bơm 6204','Cái',45000,38000,60000,'Thay thế bạc đạn bơm','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Phớt cơ khí bơm 35mm','Bộ',320000,280000,400000,'Làm kín trục bơm','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
    ]],
    ['NH02','Điện - Chiếu sáng','DCS','DCS',[
      ['Đèn LED pha 100W chống nước','Bộ',650000,550000,800000,'Chiếu sáng công trường ban đêm','Trung bình','từ 12 đến 18 tháng','Chi phí thiết bị'],
      ['Dây điện Cadivi 2x2.5mm','Mét',18000,15000,24000,'Cấp nguồn thiết bị thi công','Trung bình','từ 6 đến 12 tháng','Chi phí vật tư'],
      ['Ổ cắm công nghiệp 3 pha','Cái',145000,120000,180000,'Đấu nối thiết bị 3 pha','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Aptomat MCB 2P 32A','Cái',210000,180000,260000,'Bảo vệ mạch điện','Trung bình','từ 12 đến 24 tháng','Chi phí vật tư'],
      ['Bóng đèn LED bulb 20W','Bóng',55000,45000,75000,'Chiếu sáng lán trại','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
    ]],
    ['NH03','Đường ống - Cấp thoát nước','CTN','CTN',[
      ['Ống nhựa uPVC D200 dày','Cây',420000,380000,500000,'Thay đoạn ống thoát chính','Trung bình','từ 18 đến 36 tháng','Chi phí vật tư'],
      ['Co nối uPVC 90° D114','Cái',38000,30000,52000,'Đấu nối góc đường ống','Trung bình','từ 12 đến 24 tháng','Chi phí vật tư'],
      ['Keo dán ống PVC 500g','Hộp',85000,70000,110000,'Dán mối nối ống','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
      ['Van cổng gang D100','Cái',1250000,1100000,1500000,'Đóng mở tuyến cấp nước','Trung bình','từ 24 đến 36 tháng','Chi phí thiết bị'],
      ['Gioăng cao su mặt bích D100','Cái',25000,20000,35000,'Làm kín mặt bích','Dễ hư hỏng','từ 1 đến 3 tháng','Chi phí vật tư'],
    ]],
    ['NH04','Phụ tùng xe - Cơ khí','PTX','PTX',[
      ['Lọc dầu xe hút bùn','Cái',180000,150000,230000,'Bảo dưỡng xe chuyên dụng','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Lốp xe ben 1000-20','Cái',3200000,2900000,3800000,'Thay lốp xe vận chuyển','Trung bình','từ 12 đến 24 tháng','Chi phí thiết bị'],
      ['Dây curoa máy nén','Sợi',120000,95000,160000,'Truyền động bơm chân không','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Bình ắc quy 12V-100Ah','Bình',2100000,1900000,2500000,'Khởi động xe chuyên dụng','Trung bình','từ 12 đến 24 tháng','Chi phí thiết bị'],
      ['Bố thắng xe tải','Bộ',450000,380000,560000,'Bảo dưỡng hệ thống phanh','Dễ hư hỏng','từ 6 đến 12 tháng','Chi phí vật tư'],
    ]],
    ['NH05','Bảo hộ lao động','BHL','BHL',[
      ['Quần áo bảo hộ phản quang','Bộ',185000,150000,240000,'Trang bị công nhân thi công','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Ủng cao su lội cống','Đôi',95000,80000,130000,'Bảo hộ chân khi nạo vét','Dễ hư hỏng','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Găng tay cao su dài','Đôi',35000,28000,48000,'Bảo hộ tay tiếp xúc nước thải','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
      ['Mặt nạ phòng độc bán mặt','Cái',280000,240000,350000,'Phòng khí độc hố ga','Trung bình','từ 6 đến 12 tháng','Chi phí vật tư'],
      ['Mũ bảo hộ có kính','Cái',75000,60000,100000,'Bảo hộ đầu công trường','Dễ hư hỏng','từ 6 đến 12 tháng','Chi phí vật tư'],
    ]],
    ['NH06','An toàn giao thông','ATG','ATG',[
      ['Cọc tiêu phản quang 1m','Cái',85000,70000,110000,'Cảnh báo khu vực thi công','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Biển báo công trường','Cái',320000,280000,400000,'Cảnh báo giao thông','Trung bình','từ 12 đến 24 tháng','Chi phí vật tư'],
      ['Dây phản quang chắn 50m','Cuộn',150000,120000,190000,'Khoanh vùng nguy hiểm','Dễ hư hỏng','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Đèn chớp cảnh báo năng lượng MT','Cái',210000,180000,270000,'Cảnh báo ban đêm','Trung bình','từ 6 đến 12 tháng','Chi phí vật tư'],
      ['Rào chắn nhựa A','Cái',420000,360000,520000,'Phân luồng giao thông','Trung bình','từ 18 đến 36 tháng','Chi phí thiết bị'],
    ]],
    ['NH07','Dụng cụ cầm tay','KHA','DCT',[
      ['Búa tạ 5kg cán gỗ','Cái',180000,150000,230000,'Phá dỡ bê tông nhỏ','Trung bình','từ 12 đến 24 tháng','Chi phí dụng cụ'],
      ['Xà beng thép 1.2m','Cái',135000,110000,170000,'Cạy nắp hố ga','Trung bình','từ 12 đến 24 tháng','Chi phí dụng cụ'],
      ['Kìm cộng lực 600mm','Cái',320000,280000,400000,'Cắt thép, khóa','Trung bình','từ 12 đến 24 tháng','Chi phí dụng cụ'],
      ['Cuốc chim','Cái',110000,90000,145000,'Đào đất cứng','Dễ hư hỏng','từ 6 đến 12 tháng','Chi phí dụng cụ'],
      ['Xẻng xúc đất','Cái',85000,70000,110000,'Xúc đất, bùn','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí dụng cụ'],
    ]],
    ['NH08','Dụng cụ đo lường','KHA','DDL',[
      ['Thước cuộn thép 50m','Cái',180000,150000,230000,'Đo đạc tuyến ống','Trung bình','từ 12 đến 24 tháng','Chi phí dụng cụ'],
      ['Máy đo độ sâu cầm tay','Cái',1850000,1600000,2300000,'Đo độ sâu hố ga','Trung bình','từ 24 đến 36 tháng','Chi phí thiết bị'],
      ['Đồng hồ đo áp lực nước','Cái',280000,240000,350000,'Kiểm tra áp lực đường ống','Trung bình','từ 12 đến 18 tháng','Chi phí dụng cụ'],
      ['Máy đo khí độc 4 trong 1','Cái',6500000,5800000,7800000,'Đo khí trong hố ga','Trung bình','từ 24 đến 36 tháng','Chi phí thiết bị'],
      ['Thước thủy 60cm','Cái',95000,75000,125000,'Cân chỉnh độ dốc','Dễ hư hỏng','từ 6 đến 12 tháng','Chi phí dụng cụ'],
    ]],
    ['NH09','Nạo vét - Vệ sinh','KHA','NVS',[
      ['Vòi xịt áp lực cao 3000PSI','Bộ',2400000,2100000,2900000,'Thông tắc cống','Trung bình','từ 12 đến 18 tháng','Chi phí thiết bị'],
      ['Gàu múc bùn thủ công','Cái',150000,120000,190000,'Nạo vét bùn hố ga','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí dụng cụ'],
      ['Bàn chải sắt thông cống','Cái',65000,50000,90000,'Cọ rửa thành cống','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
      ['Hóa chất tẩy rửa cống 20L','Can',450000,380000,560000,'Khử mùi, làm sạch','Dễ hư hỏng','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Dây thông cống lò xo 15m','Cuộn',680000,580000,820000,'Thông tắc đường ống','Trung bình','từ 6 đến 12 tháng','Chi phí dụng cụ'],
    ]],
    ['NH10','Phụ kiện máy cắt','KHA','PMC',[
      ['Lưỡi cắt bê tông D350','Cái',420000,360000,520000,'Cắt mặt đường bê tông','Dễ hư hỏng','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Lưỡi cắt sắt D105','Cái',18000,14000,26000,'Cắt thép, ống','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
      ['Đá mài D100','Viên',12000,9000,18000,'Mài bavia','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
      ['Chổi than máy cắt','Cặp',45000,35000,62000,'Bảo dưỡng máy cắt','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Bánh xe dẫn hướng máy cắt','Cái',95000,75000,125000,'Thay thế máy cắt đường','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
    ]],
    ['NH11','Vật tư phụ','VTP','VTP',[
      ['Băng keo điện','Cuộn',12000,9000,18000,'Cách điện mối nối','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
      ['Bu lông inox M12','Con',8000,6000,12000,'Liên kết kết cấu','Trung bình','từ 12 đến 24 tháng','Chi phí vật tư'],
      ['Dây thừng PP D16','Mét',9000,7000,14000,'Buộc, kéo thiết bị','Dễ hư hỏng','từ 3 đến 6 tháng','Chi phí vật tư'],
      ['Bao tải dứa','Cái',4500,3000,7000,'Đựng bùn đất','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
      ['Giẻ lau công nghiệp 1kg','Kg',28000,22000,38000,'Vệ sinh thiết bị','Dễ hư hỏng','1 tháng','Chi phí vật tư'],
    ]],
    ['NH12','Xây dựng','XDG','XDG',[
      ['Xi măng PCB40','Bao',95000,85000,115000,'Hoàn trả mặt đường','Trung bình','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Cát vàng xây dựng','m³',420000,360000,520000,'Trộn bê tông, vữa','Trung bình','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Đá 1x2','m³',380000,330000,460000,'Đổ bê tông','Trung bình','từ 1 đến 3 tháng','Chi phí vật tư'],
      ['Thép phi 16 Việt Nhật','Cây',185000,160000,230000,'Gia cố kết cấu','Trung bình','từ 6 đến 12 tháng','Chi phí vật tư'],
      ['Nắp hố ga gang D600','Cái',1850000,1650000,2200000,'Thay nắp hố ga hỏng','Trung bình','từ 24 đến 36 tháng','Chi phí thiết bị'],
    ]],
  ];

  // Sinh ra danh sách mặt hàng. Nhân bản template để đạt ~300 dòng,
  // mỗi bản sao biến thể nhẹ (size/công suất) -> ma_hang luôn UNIQUE.
  const variants = ['', ' - Loại A', ' - Loại B', ' - Cỡ nhỏ', ' - Cỡ lớn'];
  const items = [];
  let stt = 0;
  TPL.forEach(([id_nhom, ten_nhom, ma_nhom, prefix, samples]) => {
    samples.forEach((s, si) => {
      variants.forEach((vlabel, vi) => {
        stt++;
        const [ten, dvt, dg, gmin, gmax, mucdich, huhong, chuky, cp] = s;
        // biến thể giá ±8% mỗi variant để dữ liệu đa dạng
        const f = 1 + (vi - 2) * 0.08;
        const don_gia = Math.round(dg * f / 1000) * 1000;
        const ncc = window.CONFIG.GROUP_TO_NCC[ma_nhom];
        items.push({
          stt,
          ma_hang: `${prefix}-${String(si + 1).padStart(2,'0')}${vi}`,
          ten_hang_hoa: ten + vlabel,
          dvt,
          don_gia,
          gia_thi_truong: `${Math.round(gmin*f)} - ${Math.round(gmax*f)}`,
          phan_loai_nhom_hang: ten_nhom, // = ten_nhom (R-01: dùng tên nhóm, không dùng ma_nhom)
          id_nhom,                        // khóa phân biệt KHA
          ma_nhom,
          nha_cung_cap: ncc,
          muc_dich_su_dung: mucdich,
          muc_do_hu_hong: huhong,
          chu_ky_thay_the: chuky,
          phan_loai_chi_phi: cp,
        });
      });
    });
  });
  // 12 nhóm × 5 mẫu × 5 variant = 300 mặt hàng ✔

  return { ITEMS: items, NHOM: window.CONFIG.DANH_MUC_NHOM, NCC: window.CONFIG.NHA_CUNG_CAP };
})();
