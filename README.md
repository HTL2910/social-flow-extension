# Social Flow — Tự lướt & Like · v0.1.2

Bản thử nghiệm extension Chrome/Edge cho Windows, không cần cài Node hay chạy máy chủ để sử dụng.

## Hành vi đã chốt

- Tự cuộn website cho đến khi bạn bấm **Dừng** trong popup hoặc trên panel ở góc trái dưới của trang.
- **Không tự tạm dừng** khi chuyển tab, mất focus, rê chuột, gõ nội dung hoặc hết giới hạn like.
- Hết giới hạn like: không bấm thêm like, **vẫn tiếp tục cuộn**.
- Đóng popup không làm dừng extension. Đóng tab hoặc trình duyệt kết thúc phiên. Tải lại cùng website có thể khôi phục phiên nếu quyền truy cập tab còn hiệu lực; chuyển sang website khác cần bật lại.

## Cài trên Chrome hoặc Edge

1. Giải nén toàn bộ `Social-Flow-Chrome-v0.1.2.zip`, ví dụ vào `C:\dev\Social-Flow`.
2. Mở `chrome://extensions` (Chrome) hoặc `edge://extensions` (Edge).
3. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
4. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
5. Chọn thư mục vừa giải nén. `manifest.json` nằm ngay thư mục gốc của gói cài mới.
6. Ghim Social Flow trong menu tiện ích. Mở Facebook, đăng nhập như bình thường, rồi bấm biểu tượng Social Flow.
7. Chỉnh cấu hình và bấm **Bắt đầu lướt**.

Không chọn file ZIP trực tiếp và không cần chạy `npm install` để cài extension.

## Thiết lập

| Mục | Mặc định | Ý nghĩa |
| --- | --- | --- |
| Khoảng nghỉ | 3 giây | Khoảng cách giữa các lượt; lượt có like cần thêm thời gian xác nhận |
| Mỗi lần cuộn | 450 px | Độ dài cuộn trang chính |
| Cứ mỗi | 10 bài | Thử like bài đủ điều kiện thứ 10, 20, 30... |
| Tối đa mỗi phiên | 5 | Giới hạn **lượt thử like**, bao gồm lượt chưa xác nhận được |
| Tự like | Bật | Chỉ áp dụng Facebook desktop |

Cấu hình được khóa khi chạy. Muốn đổi, bấm Dừng rồi thay đổi và Bắt đầu; thao tác này tạo phiên mới, đặt lại bộ đếm. Đặt giới hạn 0 hoặc bỏ chọn Tự like để chỉ cuộn.

**Bài đủ điều kiện**: bài chưa like, nhận diện được định danh (đường dẫn cố định hoặc dấu vân tay nội dung đủ rõ) và cụm nút Like của bài, không bị nhận diện là quảng cáo, và nút Like đã đi vào vùng nhìn thấy. Bài đã tính trong phiên không được tính lại. Vì vậy số “Bài hợp lệ” có thể thấp hơn số bài bạn nhìn thấy.

“Đã like” chỉ tăng khi giao diện xác nhận. Extension không bấm lại bài chưa xác nhận; lượt thử vẫn tính vào giới hạn. Nếu nhiều bài đồng thời xuất hiện, mỗi lượt xử lý chỉ bấm tối đa một Like.

## Phạm vi hỗ trợ và giới hạn thực tế

- **Facebook desktop:** `www.facebook.com`, `web.facebook.com`, `facebook.com`; nhãn thao tác tiếng Việt/Anh. v0.1.2 chưa được xác minh trên một tài khoản Facebook thật. Facebook có nhiều phiên bản giao diện, nên có thể chỉ cuộn mà chưa nhận diện được nút Like. Khi không rõ nút nào thuộc bài, extension bỏ qua.
- **Website khác:** tự cuộn trang chính; chưa tự like trên Instagram, TikTok, X, LinkedIn, Reddit. Khung cuộn riêng bên trong trang, Reels và trình phát video không nằm trong phạm vi bản này.
- Quảng cáo chỉ bị bỏ qua khi nhận diện được nhãn tài trợ. Không bảo đảm phát hiện nhãn bị chia nhỏ hoặc thay đổi.
- Chrome/Edge có thể làm chậm timer, đóng băng hoặc loại bỏ tab nền. Không có logic tự pause trong extension, nhưng không thể bảo đảm tốc độ cuộn khi tab ẩn hoặc máy ngủ.
- Tối đa nhận diện 5.000 bài trong một phiên; sau ngưỡng này tiếp tục cuộn và không thử thêm like để tránh tính trùng.
- Mỗi tab có phiên riêng. Muốn dừng một tab đang chạy, quay lại tab đó và bấm Dừng hoặc đóng tab.

## Khi chỉ cuộn mà chưa like

Kiểm tra Tự like đã bật, giới hạn lớn hơn 0, đúng Facebook desktop và giao diện tiếng Việt/Anh. Xem số Bài hợp lệ có tăng không. Nếu số này luôn bằng 0, bộ nhận diện chưa tương thích giao diện hiện tại; cần chỉnh `extension/facebook.js` theo DOM thực tế. Không tăng tần suất để khắc phục lỗi nhận diện.

## Quyền và dữ liệu

Chỉ dùng `activeTab`, `scripting`, `storage`. Extension được truy cập tab khi bạn chủ động mở tiện ích. Không yêu cầu mật khẩu, không đọc cookie/token, không gọi API Facebook riêng, không gửi nội dung bài viết ra ngoài và không tải mã từ máy chủ. Thiết lập lưu trong trình duyệt; định danh bài đã xử lý và thống kê lưu tạm trong phiên trình duyệt.

## Dành cho người sửa mã

- `extension/core.js`: cấu hình, đếm bài, chống trùng, giới hạn lượt thử.
- `extension/facebook.js`: nhận diện bài và cụm nút thao tác.
- `extension/content.js`: lịch cuộn/like, trạng thái và panel Dừng.
- `extension/background.js`: chèn script, lưu/khôi phục trạng thái theo tab.
- `extension/popup.*`: giao diện tiếng Việt.

Kiểm thử logic (Node.js 20+; không cần dependency):

```powershell
npm test
```

Kiểm thử fixture trên Chromium (không dùng tài khoản thật):

```powershell
npm install
npx playwright install chromium
npm run test:browser
```

Xem `TEST-REPORT.md` để biết chính xác phần đã được chạy trong lần bàn giao này. Không có bộ kiểm thử nào tự like trên tài khoản thật.

## Tài liệu tham khảo

- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/blog/timer-throttling-in-chrome-88/

## Cập nhật 0.1.2

Dừng bản cũ, thay file trong thư mục đã cài, bấm nút tải lại của Social Flow ở chrome://extensions, sau đó tải lại tab Facebook (F5). Kiểm tra popup hiển thị v0.1.2. Nếu tải bản mới sang thư mục khác, gỡ bản cũ rồi Load unpacked thư mục mới để không chạy hai extension cùng lúc.

Bộ nhận diện bổ sung khung FeedUnit, chữ Thích/Like nhìn thấy khi aria-label khác, cụm nút có nhiều lớp bao, đường dẫn ảnh có fbid. Khi không có permalink, chỉ dùng dấu vân tay từ tác giả và vùng nội dung bài được đánh dấu rõ; không lưu văn bản bài. Hai bài cùng tác giả, cùng nội dung có thể được gộp thành một và bỏ qua like trùng. Bài không có đủ tín hiệu vẫn bị bỏ qua.

Mở **Chẩn đoán nhận diện** để thấy: số khung bài, nút Like, bài hợp lệ, nút trong màn hình; số bị bỏ qua vì thiếu nút, thiếu định danh, đã có cảm xúc hoặc quảng cáo. Thống kê này không chứa nội dung bài hay tên tác giả.

Gói cài có mã nguồn và kiểm thử đầy đủ trong `development/`. Để chạy kiểm thử, vào thư mục này rồi chạy `npm install` và `npm test`.
