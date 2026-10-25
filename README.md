# TryYourPet

TryYourPet là dự án phi lợi nhuận kết nối các trạm cứu hộ với cộng đồng, nhằm tìm mái nhà phù hợp cho các bé chó, mèo ở TP.HCM, thông qua nhận nuôi hoặc hỗ trợ hiện kim, hiện vật.

Đây là bản demo giao diện (prototype). Dữ liệu chỉ lưu trên trình duyệt của người xem, chưa có máy chủ và chưa gửi email thật.

## Chức năng trong bản demo

- Xem hồ sơ các bé, lọc theo loài, giống, giới tính, cân nặng
- Thêm bé vào "Nhà của tôi" (tối đa 2 bé, giữ chỗ 7 ngày)
- Đăng ký nhận nuôi: thông tin cá nhân, xác thực email, câu hỏi sàng lọc, chọn lịch đón bé tại trạm
- Hỗ trợ các bé bằng tiền (chuyển khoản) hoặc hiện vật
- Trang quản trị: đơn nhận nuôi, lịch đón bé, lượt hỗ trợ, cài đặt khung giờ

## Cấu trúc

```
tryyourpet.html     Toàn bộ trang (HTML, CSS, JavaScript)
assets/             Logo, mascot, phụ kiện, mã QR
assets/fonts/       Editorial New Ultra Light, Neulis Sans
```

## Chạy thử

Mở `tryyourpet.html` qua một máy chủ tĩnh bất kỳ (font và ảnh nạp theo đường dẫn tương đối), ví dụ:

```bash
npx serve .
```

## Triển khai lên Netlify

`netlify.toml` đã cấu hình sẵn: Netlify chạy `node scripts/build.mjs`, script này bọc `tryyourpet.html` thành trang `dist/index.html` hoàn chỉnh và chép `assets/`, rồi xuất bản thư mục `dist/`. Mỗi lần push lên nhánh `main`, Netlify tự build và cập nhật website.

Build thử trên máy:

```bash
node scripts/build.mjs
```

## Ghi chú

Editorial New và Neulis Sans là font có bản quyền của bên phát hành. Kiểm tra giấy phép trước khi dùng lại.
