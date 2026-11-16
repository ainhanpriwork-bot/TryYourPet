# Hướng dẫn cài đặt TryYourPet

Khách xem hồ sơ các bé trên web, rồi nhận nuôi bằng cách inbox fanpage hoặc gọi điện. Web gồm 2 phần, đều có gói miễn phí:

| Phần | Dịch vụ | Làm gì |
|---|---|---|
| Website và máy chủ | Vercel | Hiển thị trang, trả danh sách bé, xử lý trang quản trị |
| Cơ sở dữ liệu, đăng nhập, lưu ảnh | Supabase | Lưu các bé và trạm; tài khoản quản trị; ảnh các bé |

## Bước 1. Tạo Supabase

1. Vào https://supabase.com, đăng ký và chọn **New project**. Đặt **Database password** mạnh và lưu lại.
2. Khi project tạo xong, mở **SQL Editor → New query**:
   - Dán toàn bộ nội dung file `supabase/schema.sql`, bấm **Run**.
   - Tạo query mới, dán nội dung `supabase/storage.sql`, bấm **Run**.
3. Thêm quản trị viên:
   - **Authentication → Users → Add user → Create new user**: nhập email và mật khẩu tạm cho từng người, tick **Auto Confirm User**.
   - Trong **SQL Editor**, chạy (thay bằng email thật):
     ```sql
     insert into admins (email) values ('nguoi1@gmail.com'), ('nguoi2@gmail.com')
     on conflict (email) do nothing;
     ```
   Chỉ email vừa có tài khoản ở Authentication vừa nằm trong bảng `admins` mới vào được trang quản trị.
4. **Authentication → URL Configuration**: điền **Site URL** là địa chỉ Vercel (ví dụ `https://tryyourpet-chi.vercel.app`). Link "Quên mật khẩu" sẽ dẫn về đây.

## Bước 2. Kết nối Vercel

1. Vào https://vercel.com/signup, chọn **Continue with GitHub**, gói **Hobby** (miễn phí).
2. **Add New… → Project**, ở dòng repo **TryYourPet** bấm **Import**.
3. **Framework Preset** để **Other**, không sửa Build/Output (Vercel đọc từ `vercel.json`).
4. Mở **Environment Variables** và thêm 4 biến theo file `.env.example`:

| Biến | Lấy ở đâu |
|---|---|
| `DATABASE_URL` | Supabase → nút **Connect** → **Connection String** → mục **Transaction pooler** (địa chỉ có `pooler.supabase.com`, cổng `6543`), thay `[YOUR-PASSWORD]` bằng mật khẩu database. **Không** dùng mục Direct connection (`db.xxx.supabase.co`). |
| `SUPABASE_URL` | Supabase → Project Settings → Data API (hoặc API) → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys, khóa **anon public** hoặc **publishable** |
| `SUPABASE_SERVICE_ROLE_KEY` | Cùng trang, khóa **service_role** hoặc **secret**. **Bí mật.** |

5. Bấm **Deploy**. Sửa biến về sau: **Settings → Environment Variables**, rồi **Deployments → ⋯ → Redeploy**.

## Bước 3. Nhập dữ liệu

1. Mở `https://<địa-chỉ-web>/admin.html` và đăng nhập.
2. Tab **Trạm**: điền địa chỉ và số điện thoại của từng trạm. Thêm trạm khác nếu có.
3. Tab **Thú cưng**: bấm **Thêm bé mới**, nhập hồ sơ và tải ảnh (mỗi ảnh tối đa 3 MB). Video thì dán link YouTube, Facebook hoặc Google Drive.

## Vận hành hằng ngày

- Khách nhắn tin hoặc gọi điện, trạm trao đổi và hẹn ngày đón trực tiếp với khách.
- Khi bé đã về nhà mới: tab **Thú cưng** → **Sửa** → tick **Đã có nhà** → **Lưu hồ sơ**. Trên web bé chuyển sang "Đã có nhà" và không còn nút nhận nuôi.
- Muốn tạm ẩn một bé: bỏ tick **Hiện trên website**.
- Đổi fanpage hoặc số điện thoại liên hệ: sửa `CONTACT` trong `site/js/rules.js`, rồi push lên GitHub để Vercel cập nhật.

## Chạy thử trên máy (cho người phát triển)

```bash
npm install
npm test          # bài kiểm tra cho máy chủ, chạy trên Postgres giả lập
npm run dev       # mở http://127.0.0.1:8888 và /admin.html
```

## Bảo mật

- Trình duyệt không bao giờ đọc thẳng cơ sở dữ liệu. Mọi bảng đều bật row level security và không có policy nào. Chỉ máy chủ Vercel, dùng mật khẩu database, mới đọc ghi dữ liệu.
- Web không thu thông tin cá nhân của khách. Việc trao đổi nhận nuôi diễn ra qua Messenger hoặc điện thoại.
