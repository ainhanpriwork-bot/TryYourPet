# TryYourPet

TryYourPet là dự án phi lợi nhuận kết nối các trạm cứu hộ với cộng đồng, nhằm tìm mái nhà phù hợp cho các bé chó, mèo ở TP.HCM, thông qua nhận nuôi.

## Chức năng

- **Khách**:
  - Xem hồ sơ các bé (ảnh, video, tính cách, lịch sử cứu hộ), lọc theo loài, giống, giới tính, cân nặng.
  - Nhận nuôi bằng cách inbox fanpage [Purr Nature](https://www.facebook.com/purr.nature.store/), [Try Your Pet](https://www.facebook.com/profile.php?id=61595854864529) hoặc gọi PM Đặng Hương Giang, 0364 124 467. Thông tin liên hệ nằm trong `site/js/rules.js` (`CONTACT`).
- **Quản trị** (`/admin.html`, đăng nhập bằng email và mật khẩu):
  - Thêm, sửa hồ sơ và ảnh các bé; ẩn bé; đánh dấu bé đã có nhà.
  - Sửa thông tin các trạm.

## Cấu trúc

```
site/                   Website tĩnh do Vercel phục vụ
  index.html, js/app.js       Trang khách hàng
  admin.html, js/admin.js     Trang quản trị
  js/rules.js                 Thông tin liên hệ và quy tắc dùng chung cho trình duyệt và máy chủ
  css/app.css, assets/        Giao diện, logo, mascot, font
api/handler.js              Hàm Vercel nhận mọi đường dẫn /api/* (xem vercel.json)
server/
  app.mjs                     Danh sách bé công khai, quản lý bé và trạm
  http.mjs                    Đọc yêu cầu, trả lỗi cấu hình dễ hiểu
  deps.mjs                    Kết nối Supabase (Postgres, Storage, Auth)
supabase/schema.sql, storage.sql   Tạo cơ sở dữ liệu và kho ảnh (cho project mới)
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
