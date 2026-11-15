# Giới thiệu & Liên hệ

Chạy từ thư mục `frontend`:

```sh
npm ci
npm run dev
```

Mở `http://localhost:5173/about`, hoặc chọn **Giới thiệu StationeryStore** ở footer.

- `/about#values`: giá trị cốt lõi.
- `/about#contact`: biểu mẫu liên hệ.
- `/about#stores`: thông tin cửa hàng.
- `/about#faq`: mở câu hỏi thường gặp.
- `/contact` và `/lien-he`: mở trực tiếp khu vực liên hệ.

Biểu mẫu có kiểm tra trường bắt buộc và giới hạn 500 ký tự. Khi gửi,
trang soạn email qua ứng dụng email trên thiết bị; người dùng cần bấm
Gửi trong ứng dụng đó để hoàn tất. Backend hiện chưa có API tiếp nhận
liên hệ. Ảnh bản đồ được lưu sẵn; nút chỉ đường mở Google Maps.

Ảnh minh họa được lưu tại `frontend/public/images/` (nguồn: Unsplash).
Bản đồ nền: © OpenStreetMap contributors, có ghi nguồn trên giao diện.
Trang này không yêu cầu chạy hoặc thay đổi cơ sở dữ liệu SQL.

Build production: `npm run build` từ thư mục `frontend`.

## Kiểm thử tính năng

Giữ Vite chạy bằng `npm run dev`, rồi mở terminal thứ hai tại `frontend`:

```sh
npm run test:about
```

Bộ test chạy Chrome/Edge ẩn, dùng thao tác chuột và nhập liệu thật để kiểm tra
điều hướng, FAQ, kiểm tra biểu mẫu, nội dung email và 6 kích thước màn hình.
Không gửi email thực tế. Kết quả JSON nằm ở `.cache/about-functional-results.json`
tại thư mục gốc project.

Có thể đặt `TEST_BASE_URL` nếu Vite chạy ở cổng khác, `CHROME_PATH` nếu trình duyệt
nằm ở vị trí khác, hoặc `CDP_URL` để dùng trình duyệt debug đang chạy.
