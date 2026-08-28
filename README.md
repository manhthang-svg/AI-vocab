# milim

## Phát hành bản cập nhật tự động

Milim dùng GitHub Releases và `electron-updater`. Khi mã nguồn đã được đẩy lên
`manhthang-svg/AI-vocab`, tạo một tag trùng với phiên bản trong `package.json`:

```powershell
git tag v4.0.0
git push origin v4.0.0
```

GitHub Actions sẽ tự đóng gói Windows và đưa bộ cài, blockmap cùng `latest.yml`
vào một Release công khai. Các bản milim đã cài sẽ kiểm tra cập nhật khi khởi
động và mỗi 6 giờ. Mỗi phiên bản mới phải tăng trường `version` trước khi tạo tag.

Ứng dụng desktop học từ vựng tiếng Anh với bộ từ theo ngày, active recall, lịch ôn FSRS-6, Writing Journal và cây hoa phát triển theo chuỗi ngày học.

## Chạy ứng dụng

```powershell
npm install
npm start
```

## Đóng gói bản cài đặt Windows

```powershell
npm run dist
```

Dữ liệu được lưu local trong thư mục `userData` của Electron và có thể sao lưu/khôi phục từ màn hình Cài đặt.

