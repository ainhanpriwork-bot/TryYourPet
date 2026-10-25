# Hướng dẫn cài đặt TryYourPet (web thật có máy chủ)

Web gồm 3 phần, đều có gói miễn phí:

| Phần | Dịch vụ | Làm gì |
|---|---|---|
| Website và máy chủ | Netlify | Hiển thị trang, chạy các xử lý (giữ chỗ, đơn, hỗ trợ), tự hủy đơn trễ hẹn mỗi giờ |
| Cơ sở dữ liệu, đăng nhập, lưu ảnh | Supabase | Lưu các bé, đơn, hỗ trợ; tài khoản quản trị; ảnh bé và ảnh minh chứng |
| Email | Gmail của dự án | Gửi mã xác thực, xác nhận đơn, nhắc lịch, thông báo cho quản trị viên |

Làm lần lượt 4 bước dưới đây. Mỗi bước khoảng 5–10 phút.

## Bước 1. Tạo Supabase

1. Vào https://supabase.com, đăng ký và chọn **New project**.
   - Region: **Southeast Asia (Singapore)**.
   - Đặt **Database password** mạnh và lưu lại (cần ở bước 3).
2. Khi project tạo xong, mở **SQL Editor → New query**:
   - Dán toàn bộ nội dung file `supabase/schema.sql`, bấm **Run**.
   - Tạo query mới, dán nội dung `supabase/storage.sql`, bấm **Run**.
3. Thêm 6 quản trị viên:
   - Vào **Authentication → Users → Add user → Create new user**. Nhập email và mật khẩu tạm cho từng người, tick **Auto Confirm User**.
   - Trong **SQL Editor**, chạy (thay bằng email thật):
     ```sql
     insert into admins (email) values
       ('nguoi1@gmail.com'), ('nguoi2@gmail.com'), ('nguoi3@gmail.com'),
       ('nguoi4@gmail.com'), ('nguoi5@gmail.com'), ('nguoi6@gmail.com');
     ```
   Chỉ email vừa có tài khoản ở Authentication vừa nằm trong bảng `admins` mới vào được trang quản trị.
4. Vào **Authentication → URL Configuration**, điền **Site URL** là địa chỉ Netlify (ví dụ `https://tryyourpet.netlify.app`). Link "Quên mật khẩu" sẽ dẫn về đây.

## Bước 2. Chuẩn bị Gmail của dự án

1. Dùng một Gmail riêng cho dự án, không dùng Gmail cá nhân.
2. Bật **Xác minh 2 bước** tại https://myaccount.google.com/security.
3. Vào https://myaccount.google.com/apppasswords, tạo mật khẩu ứng dụng tên "TryYourPet". Google hiện 16 ký tự, lưu lại (cần ở bước 3).

Gmail gửi được khoảng 500 email mỗi ngày, dư cho quy mô hiện tại.

## Bước 3. Kết nối Netlify

1. Vào https://app.netlify.com → **Add new project → Import an existing project → GitHub**, chọn repo **TryYourPet**.
   Netlify tự đọc cấu hình từ `netlify.toml`, không cần sửa gì.
2. Trước khi bấm **Deploy**, vào **Environment variables** và thêm từng biến theo file `.env.example`:

| Biến | Lấy ở đâu |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **URI**, chọn **Transaction pooler**, thay `[YOUR-PASSWORD]` bằng mật khẩu database |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Cùng trang, khóa **anon public** |
| `SUPABASE_SERVICE_ROLE_KEY` | Cùng trang, khóa **service_role**. **Bí mật, không gửi cho ai.** |
| `GMAIL_USER` | Địa chỉ Gmail của dự án |
| `GMAIL_APP_PASSWORD` | 16 ký tự ở bước 2, viết liền không dấu cách |
| `NOTIFY_EMAIL` | Email nhận thông báo đơn mới (có thể bỏ trống, mặc định gửi về Gmail dự án) |
| `TOKEN_SECRET` | Một chuỗi ngẫu nhiên dài, ví dụ gõ bừa 50 ký tự |

3. Bấm **Deploy**. Sau khoảng 1–2 phút, web chạy tại địa chỉ dạng `ten-ngau-nhien.netlify.app`. Đổi tên trong **Project configuration → Change project name**.

## Bước 4. Nhập dữ liệu và chạy thử

1. Mở `https://<địa-chỉ-web>/admin.html` và đăng nhập bằng một tài khoản quản trị.
2. Tab **Trạm**: điền địa chỉ đón bé, số điện thoại, đồ đang cần cho từng trạm. Thêm trạm nhận chó nếu có.
3. Tab **Thú cưng**: bấm **Thêm bé mới**, nhập hồ sơ và tải ảnh cho từng bé. Video thì dán link YouTube, Facebook hoặc Google Drive.
4. Tab **Cài đặt lịch**: chọn ngày mở cửa và số khách tối đa mỗi khung giờ.
5. Ở trang chủ, thử một vòng: thêm bé vào nhà, nhận mã xác thực qua email, gửi đơn. Sau đó vào trang quản trị duyệt đơn.

## Vận hành hằng ngày

- **Đơn chờ duyệt**: tab **Đơn nhận nuôi**. Bấm **Chi tiết** để xem CCCD, địa chỉ và câu trả lời sàng lọc, rồi **Duyệt** hoặc **Từ chối**.
- **Ngày đón bé**: khi giao bé xong, bấm **Đã giao bé**. Bé chuyển sang "Đã có nhà".
  - Khách không đến thì bấm **Vắng mặt**.
  - Nếu quên bấm, hệ thống tự hủy đơn 2 tiếng sau khi hết khung giờ hẹn và nhả bé.
- **Hỗ trợ bằng tiền**: tab **Hỗ trợ** → **Xem minh chứng**, đối chiếu với sao kê Vietcombank, rồi bấm **Đã nhận tiền** hoặc **Không khớp**. Người hỗ trợ nhận email báo kết quả.
- **Email**: tab **Email** liệt kê 20 email gần nhất. Email gửi lỗi được đánh dấu đỏ.
- **Tự động mỗi giờ**:
  - Nhả các bé giữ chỗ quá 7 ngày.
  - Hủy đơn trễ hẹn.
  - Gửi email nhắc lịch cho khách có hẹn ngày mai.

## Chạy thử trên máy (cho người phát triển)

```bash
npm install
npm test          # 11 bài kiểm tra cho toàn bộ máy chủ, chạy trên Postgres giả lập
npm run dev       # mở http://127.0.0.1:8888 và /admin.html, email in ra màn hình
```

## Bảo mật và dữ liệu cá nhân

- Trình duyệt không bao giờ đọc thẳng cơ sở dữ liệu. Mọi bảng đều bật row level security và không có policy nào. Chỉ máy chủ Netlify, dùng mật khẩu database, mới đọc ghi dữ liệu.
- Mọi quy tắc đều được máy chủ kiểm tra lại, nên sửa mã trên trình duyệt cũng không vượt qua được:
  - Tối đa 2 bé mỗi đơn, các bé cùng một trạm.
  - Giữ chỗ 7 ngày.
  - Người nhận nuôi đủ 18 tuổi.
  - Sức chứa mỗi khung giờ.
  - Bắt buộc xác thực email.
- Ảnh minh chứng chuyển khoản nằm trong kho riêng tư. Trang quản trị chỉ mở bằng link có hạn 5 phút.
- Số CCCD và địa chỉ của người nhận nuôi chỉ hiện trong trang quản trị. Theo Nghị định 13/2023/NĐ-CP, web nên có trang chính sách quyền riêng tư nói rõ mục đích thu CCCD, thời gian lưu, và cách người dùng yêu cầu xóa dữ liệu.
