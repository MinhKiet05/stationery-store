# Tích hợp thông báo React Toastify

## Phạm vi

Một `ToastContainer` duy nhất được gắn tại `App.tsx`, tồn tại qua điều hướng React Router. Cấu hình: góc trên bên phải, tự đóng sau 3 giây, dừng khi rê chuột, kéo được và thông báo mới ở trên. CSS hỗ trợ màn hình nhỏ và giảm chuyển động.

Không sửa backend, endpoint, payload, response JSON, quy tắc xác thực hoặc thứ tự điều hướng. Giữ nguyên các thay đổi backend và phần cài đặt `react-toastify` có sẵn của người dùng. Chỉ thêm script kiểm thử vào `package.json`; không chỉnh `package-lock.json` trong tác vụ này. Không commit, push hoặc deploy.

## Các luồng đã tích hợp

| Luồng | Phản hồi |
| --- | --- |
| Đăng nhập | Thành công, thất bại; cảnh báo khi đồng bộ giỏ khách thất bại; giữ nguyên điều hướng cũ |
| Đăng ký | Thành công sau API, lỗi API; giữ kiểm tra mật khẩu xác nhận tại biểu mẫu |
| Đăng xuất | Thành công ở cả header và sidebar tài khoản |
| Phiên đăng nhập hết hạn | Một cảnh báo tại nhánh xóa token đang tồn tại; các request đồng thời không tạo thêm toast lỗi cho cùng sự cố |
| Quên mật khẩu | Thông tin trung lập về email; lỗi yêu cầu |
| Đặt lại mật khẩu | Giữ trạng thái đang chuyển trang; toast thành công xuất hiện một lần sau lần tải lại `/login` hiện có |
| Đổi mật khẩu | Thành công sau HTTP 204, lỗi API; giữ nguyên validation tại biểu mẫu |
| Cập nhật hồ sơ | Thành công hoặc lỗi khi lưu; giữ ràng buộc nhập liệu HTML |
| Thêm vào giỏ / Mua ngay | Thành công sau API hoặc ghi giỏ khách; lỗi thao tác; cảnh báo giỏ khách vượt tồn kho |
| Đặt hàng COD | Thành công sau API; toast lỗi và lỗi cố định trong hộp thoại; lỗi làm mới tồn kho không biến đơn thành công thành thất bại |
| Hủy đơn hàng | Thành công hoặc lỗi; giữ nguyên điều kiện cho phép hủy và cập nhật đơn |
| Yêu cầu trả hàng | Thay `alert()` bằng thông tin chức năng chưa được hỗ trợ, không tạo yêu cầu giả |
| Yêu thích | Thêm, bỏ, xóa toàn bộ; chỉ báo thành công sau thao tác storage; báo lỗi storage |
| Chia sẻ | Sau chia sẻ/sao chép thành công; hướng dẫn nếu không thể chia sẻ; không báo lỗi khi người dùng hủy native share |
| Liên hệ | Thông tin đã chuẩn bị email sau thao tác `mailto:`; giữ hướng dẫn gửi email tại trang, không báo đã gửi email |
| Chatbot | Toast lỗi an toàn và giữ tin nhắn trong hội thoại; không toast mỗi câu trả lời thành công |

Thông báo tạm thời của đăng nhập, đăng ký, đổi mật khẩu, cập nhật hồ sơ, giỏ hàng, chia sẻ và hủy đơn đã chuyển sang toast. Lỗi tải sản phẩm/hồ sơ/đơn hàng/gợi ý vẫn nằm trên trang với nút thử lại hiện có, không tạo toast cho mỗi lần tải.

Thông báo API chỉ được hiển thị nếu khớp danh sách thông báo công khai trong `utils/notifications.ts`; ưu tiên `message`, sau đó `detail`. Một số lý do nghiệp vụ không dấu hiện có được dịch bằng bảng ánh xạ cố định; lỗi tồn kho theo mã biến thể được nhận diện bằng biểu thức đầy đủ và chuyển thành câu cố định, không hiển thị mã từ backend. Chuỗi lạ hoặc lỗi kỹ thuật dùng câu dự phòng. Khi cần hỗ trợ thêm thông báo backend, duyệt và thêm câu cố định vào danh sách, không ghép giá trị nhạy cảm vào toast.

`toastId` dựa trên loại và nội dung giúp gộp thông báo giống nhau đang hiển thị. Thông báo chỉ phát từ kết quả thao tác, không phát từ render. Sau đặt lại mật khẩu, sessionStorage chỉ lưu dấu thời gian tối đa 15 giây; không lưu token, mật khẩu hoặc nội dung backend. Việc nhận thông báo được trì hoãn đến sau chu kỳ khởi tạo StrictMode để tránh mất toast.

Các hộp thoại native `<dialog>` ở lớp trên cùng của trình duyệt: một portal host được chuyển vào dialog đang mở rồi trở lại body khi đóng. Cùng một container được giữ nguyên, không tạo container thứ hai hoặc thay đổi trạng thái/modal của trang.

## Chức năng chưa có giao diện xử lý trong frontend

- Quản trị sản phẩm, danh mục, thương hiệu, người dùng, đơn hàng, biến thể, tồn kho, khuyến mãi: không có trang/luồng admin để tích hợp.
- Sửa số lượng/xóa sản phẩm trong giỏ đã lưu: có utility giỏ khách nhưng chưa có giao diện gọi các thao tác này. Chọn số lượng trước khi thêm hàng được giữ nguyên và không phát toast mỗi lần tăng/giảm.
- Upload hình ảnh, thay avatar, gửi đánh giá: chưa có luồng thao tác; đánh giá hiện chỉ được đọc.
- Thanh toán online: checkout hiện dùng COD, không thêm xử lý cổng thanh toán.
- Đăng nhập mạng xã hội và các nút chưa có handler/API được giữ nguyên; không thông báo thành công cho thao tác chưa triển khai.

## File thay đổi trong tác vụ

Các đường dẫn dưới đây tương đối với `frontend/`.

| File | Thay đổi |
| --- | --- |
| `src/App.tsx` | Gắn component thông báo chung |
| `src/components/notifications/AppNotifications.tsx` (mới) | Container duy nhất, xử lý dialog và thông báo sau tải lại trang |
| `src/components/notifications/Notifications.css` (mới) | Giao diện, màu sắc, responsive, reduced motion |
| `src/utils/notifications.ts` (mới) | Helper bốn loại thông báo, kiểm duyệt thông báo API, chống trùng, thông báo sau reset |
| `src/services/api.ts` | Đọc thông báo lỗi an toàn và cảnh báo hết phiên tại nhánh xử lý hiện có |
| `src/services/authService.ts` | Cảnh báo khi kiểm tra phiên đăng nhập hiện có thất bại |
| `src/components/header/Header.tsx` | Toast đăng xuất |
| `src/pages/login/Login.tsx` | Toast đăng nhập/đăng ký, giữ validation |
| `src/pages/forgotPassword/ForgotPassword.tsx` | Toast quên/reset mật khẩu và giữ điều hướng |
| `src/pages/myProfile/MyProfile.tsx` | Lọc nội dung lỗi cố định trên trang |
| `src/pages/myProfile/components/ProfileSidebar.tsx` | Toast đăng xuất |
| `src/pages/myProfile/tabs/AccountInfoTab.tsx` | Toast cập nhật hồ sơ |
| `src/pages/myProfile/tabs/SecurityTab.tsx` | Toast đổi mật khẩu |
| `src/pages/myProfile/tabs/OrderHistoryTab.tsx` | Toast hủy đơn, thay alert trả hàng |
| `src/pages/myProfile/tabs/WishlistTab.tsx` | Toast xóa danh sách yêu thích |
| `src/utils/favoriteStorage.ts` | Một nơi phát toast cho thêm/bỏ yêu thích |
| `src/pages/productDetail/ProductDetail.tsx` | Toast giỏ hàng, đặt hàng, chia sẻ; giữ lỗi checkout và lọc lỗi tải trang |
| `src/pages/searchPage/SearchPage.tsx` | Lọc nội dung lỗi tải catalog, giữ lỗi cố định |
| `src/components/recommendations/Recommendations.tsx` | Lọc nội dung lỗi tải gợi ý, giữ lỗi cố định |
| `src/components/aiChat/AiChatWidget.tsx` | Toast lỗi, giữ lịch sử hội thoại |
| `scripts/test-notifications.mjs` (mới) | Kiểm thử Chrome headless với API giả lập |
| `package.json` | Thêm `test:notifications` |
| `docs/toast-notifications.md` (mới) | Báo cáo này |

## Kết quả kiểm tra

- `npm run build`: đạt khi truyền `VITE_API_BASE_URL=https://backend.example.test` riêng cho tiến trình kiểm tra. Cấu hình Vite hiện có bắt buộc URL HTTPS; không chỉnh file môi trường. Bản build kiểm tra này chứa URL giả lập, không dùng để deploy.
- `npm run test:catalog`: 5/5 đạt.
- `npm run test:notifications`: 17/17 đạt với React StrictMode và API giả lập, desktop 1365px và mobile 360px. Bao gồm payload đăng nhập/đặt hàng, đăng ký, hai vị trí đăng xuất, giỏ khách, lỗi storage, tồn kho, yêu thích, chia sẻ/hủy chia sẻ, checkout, tài khoản, hủy/trả hàng, hết phiên đồng thời, chatbot, reset sau tải lại trang, đóng toast và tự đóng. Kiểm tra toast nhận được pointer event phía trên dialog và không tràn chiều ngang trên mobile.
- Đã xem ảnh kiểm tra `.cache/toast-checkout-desktop.png` và `.cache/toast-mobile.png`. Các ảnh/log chỉ là artifact local.
- `npm run lint`: còn hai lỗi **đã có trước tác vụ** `react-hooks/set-state-in-effect` tại `ForgotPassword.tsx` và `Policy.tsx`; không thêm lỗi mới.
- `npm run test:profile`: không chạy được vì file `tests/profile.test.mjs` được script tham chiếu không tồn tại từ trước. Các luồng hồ sơ được kiểm tra trong bộ test notifications mới.
- `test:about` cũ chưa chạy trong tác vụ này; script tham chiếu `/about` và các alias chưa được router hiện tại khai báo. Không sửa router để làm test cũ qua.
- `git diff --check -- frontend`: đạt. Đã rà soát diff; không sửa backend, endpoint hoặc payload.

Chạy lại từ `frontend/`:

```powershell
npm run test:notifications
npm run test:catalog
npm run lint
npm run build
```

Build thông thường cần `VITE_API_BASE_URL` hợp lệ theo cấu hình dự án. Test notifications tự mở Vite và Chrome/Edge headless, mock toàn bộ request `/api/`, không đăng nhập hoặc ghi dữ liệu thật. Có thể đặt `CHROME_PATH` cho executable Chromium khác. Việc gửi email qua ứng dụng email thật và tích hợp API production chưa được thử trực tiếp.
