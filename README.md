# TryYourPet

TryYourPet là dự án phi lợi nhuận kết nối các trạm cứu hộ với cộng đồng, nhằm tìm mái nhà phù hợp cho các bé chó, mèo ở TP.HCM, thông qua nhận nuôi hoặc hỗ trợ hiện kim, hiện vật.

## Chức năng

- **Khách**:
  - Xem hồ sơ các bé, lọc theo loài, giống, giới tính, cân nặng.
  - Thêm bé vào "Nhà của tôi": tối đa 2 bé cùng trạm, giữ chỗ 7 ngày.
  - Đăng ký nhận nuôi: xác thực email bằng mã, câu hỏi sàng lọc, chọn lịch đón bé tại trạm. Đơn đạt yêu cầu được xác nhận ngay.
  - Hỗ trợ bằng tiền (chuyển khoản rồi gửi ảnh minh chứng) hoặc hiện vật.
- **Quản trị** (`/admin.html`, đăng nhập bằng email và mật khẩu):
  - Duyệt đơn, đánh dấu đã giao bé hoặc vắng mặt.
  - Đối soát hỗ trợ qua ảnh minh chứng.
  - Quản lý hồ sơ và ảnh các bé, thông tin trạm, ngày mở cửa và sức chứa khung giờ.
  - Xem nhật ký email.
- **Tự động mỗi giờ**: nhả bé giữ chỗ quá hạn, hủy đơn trễ hẹn, nhắc lịch trước 1 ngày.

## Cấu trúc

```
site/                   Website tĩnh do Netlify phục vụ
  index.html, js/app.js       Trang khách hàng
  admin.html, js/admin.js     Trang quản trị
  js/rules.js                 Quy tắc dùng chung cho trình duyệt và máy chủ
  css/app.css, assets/        Giao diện, logo, mascot, font, mã QR
netlify/
  functions/api.mjs           Đường dẫn /api/*
  functions/maintenance.mjs   Tác vụ chạy mỗi giờ
  lib/app.mjs                 Toàn bộ xử lý nghiệp vụ
  lib/deps.mjs                Kết nối Supabase (Postgres, Storage, Auth) và Gmail
supabase/schema.sql, storage.sql   Tạo cơ sở dữ liệu và kho file
tests/                      Bài kiểm tra máy chủ và máy chủ chạy thử trên máy
prototype/tryyourpet.html   Bản demo một file (link Claude), dữ liệu lưu trên trình duyệt
docs/HUONG-DAN-CAI-DAT.md   Hướng dẫn cài đặt từng bước
```

## Cài đặt

Xem [docs/HUONG-DAN-CAI-DAT.md](docs/HUONG-DAN-CAI-DAT.md).

```bash
npm install
npm test
npm run dev    # http://127.0.0.1:8888
```

## Ghi chú

Editorial New và Neulis Sans là font có bản quyền của bên phát hành. Cần kiểm tra giấy phép dùng trên web trước khi dùng lại.
