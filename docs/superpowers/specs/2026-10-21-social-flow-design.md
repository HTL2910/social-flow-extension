# Social Flow — thiết kế v0.1

## Mục đích và phạm vi
Extension Chrome/Edge tự cuộn website; trên Facebook desktop, tự like mỗi N bài đủ điều kiện. Người dùng chọn cách like theo tần suất và yêu cầu không tự tạm dừng khi chuyển tab, mất focus hoặc nhập nội dung. Mặc định N=10, tối đa 5 lần thử like mỗi phiên, cuộn 450px mỗi 3 giây; tất cả chỉnh được. Đạt giới hạn like vẫn cuộn. Chỉ nút Dừng kết thúc hoạt động trong tài liệu đang mở.

## Kiến trúc
Manifest V3, JavaScript thuần, không cần build hoặc máy chủ. Quyền activeTab, scripting, storage; không xin quyền trên tất cả website. Popup gửi lệnh qua service worker; worker chèn core.js, facebook.js, content.js vào tab được người dùng cấp quyền. Content script chịu trách nhiệm lịch cuộn, bộ đếm và panel Dừng; worker lưu snapshot theo tab trong storage.session, hỗ trợ tải lại cùng origin khi quyền vẫn còn. Đóng tab/trình duyệt kết thúc phiên. Điều hướng khác origin cần bật lại trên website mới. Không bảo đảm tốc độ chạy nền vì Chrome có thể throttle, freeze hoặc discard trang.

## Đếm bài và like
Chỉ nhận diện Facebook desktop www.facebook.com/web.facebook.com/facebook.com. Chọn bài top-level trong feed hoặc main; loại comment lồng, quảng cáo nhận diện được, bài đã reacted, bài thiếu permalink ổn định, hoặc nút Like không rõ ràng. Nút Like phải nằm trong cụm thao tác bài có Comment/Share. Đếm khi nút thao tác đi qua viewport; mỗi định danh tính một lần trong phiên. Mỗi bài đủ điều kiện thứ N được thử like tối đa một lần. Lưu lượt thử trước khi click; chỉ tăng lượt đã like khi DOM xác nhận trạng thái. Giới hạn dùng số lần thử để không vượt hạn mức khi Facebook phản hồi chậm. Không retry thao tác like chưa xác nhận.

## Điều khiển
Popup tiếng Việt: khoảng nghỉ, bước cuộn, mỗi N bài, tối đa mỗi phiên, bật/tắt like. Các cấu hình bị khóa khi đang chạy. Nút Bắt đầu tạo phiên mới; Dừng giữ thống kê để xem. Panel cố định nhỏ trong trang có Dừng. Không listener tự pause cho visibilitychange, blur, focus, input. Lỗi nhận diện chỉ ghi trạng thái và tiếp tục cuộn, không click đoán.

## Dữ liệu và giới hạn
Không gửi dữ liệu ra ngoài, không đọc cookie/token, không gọi API Facebook. Lưu thiết lập ở storage.local, trạng thái tạm ở storage.session; không lưu nội dung bài viết. Bộ nhớ nhận diện tối đa 5000 bài; sau đó tiếp tục cuộn, không thử thêm like trong phiên để tránh trùng. Không hứa nhận diện mọi giao diện Facebook, feed video, Reels hay mọi ngôn ngữ. v0.1 hỗ trợ nhãn tiếng Việt/Anh; website khác chỉ cuộn vùng trang chính.

## Kiểm chứng
Unit tests cho tần suất, dedupe, hạn mức, validation, khôi phục. Chromium fixture tests cho chọn đúng nút của bài, loại comment/quảng cáo/đã like, xác nhận like, cuộn sau hạn mức, không pause khi focus/visibility đổi, Dừng hủy lượt chờ, popup và worker snapshots. Không dùng tài khoản thật hay thao tác like thật trong quá trình kiểm thử. Gói ZIP gồm extension, README cài trên Windows, tests và tài liệu.

## Nguồn kỹ thuật
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/blog/timer-throttling-in-chrome-88/
