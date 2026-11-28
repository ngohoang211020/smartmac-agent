# SmartMac (`smartmac-agent`) — Trợ Lý & Bảng Điều Khiển Máy Tính Cá Nhân (Mã Nguồn Mở)

<p align="center">
  <img src="public/logo.svg" alt="SmartMac Logo" width="88" height="88" />
</p>

**SmartMac** là một ứng dụng mã nguồn mở chạy trực tiếp trên máy tính của bạn (**macOS, Windows, Linux**), giúp bạn theo dõi và điều khiển toàn bộ máy tính từ một giao diện web hiện đại (hoặc ứng dụng Desktop macOS riêng) kèm **Trợ lý AI**:

- Theo dõi **CPU, RAM, GPU, Pin, Ổ cứng** trực tiếp theo thời gian thực.
- Xem & tắt **ứng dụng / tiến trình** đang chạy, **mở / đóng / gỡ cài đặt ứng dụng** kèm dọn rác bộ nhớ đệm.
- Quản lý **Tệp tin & Thư mục**, xem/sửa nhanh file text/code, mở trong Finder/Explorer.
- Quản lý **Wi-Fi & Mạng**, quét Wi-Fi xung quanh, xem tốc độ mạng, kiểm tra Ping.
- **Chụp màn hình, Quay video màn hình (kèm mic) & Ghi âm** lưu thẳng về máy.
- Kết nối **Gmail qua Google OAuth 2.0**, thông báo email chưa đọc trong **3 ngày gần nhất** ngay trên icon Chuông (`🔔`).
- Quản lý **máy chủ VPS & kết nối SSH từ xa** chỉ với 1 cú nhấp chuột.
- Chuyển đổi nhanh ngôn ngữ **Tiếng Việt / English** và **Giao diện Sáng / Tối** riêng cho ứng dụng.

---

## 1. Chuẩn bị trước khi cài đặt

Máy tính của bạn chỉ cần cài sẵn 2 công cụ miễn phí sau:
1. **Node.js (từ bản v18 trở lên):** Tải tại [https://nodejs.org](https://nodejs.org)
2. **Git:** Tải tại [https://git-scm.com](https://git-scm.com)

Để kiểm tra máy đã có sẵn chưa, mở **Terminal** (trên Mac/Linux) hoặc **PowerShell** (trên Windows) và gõ:
```bash
node -v
git --version
```
*(Nếu hiện ra số phiên bản là đã sẵn sàng!)*

---

## 2. Cách cài đặt nhanh nhất (Chỉ 1 dòng lệnh)

### Trên macOS & Linux
Mở **Terminal**, dán dòng lệnh dưới đây rồi nhấn **Enter**:
```bash
curl -fsSL https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.sh | bash
```
**Lệnh này sẽ tự động làm hết cho bạn:**
- Tải mã nguồn về thư mục `~/.smartmac-agent`.
- Cài đặt các thư viện cần thiết (chỉ mất vài giây).
- Tạo lệnh `smartmac` dùng được ở mọi cửa sổ Terminal.
- Tự khởi chạy và mở trình duyệt tại địa chỉ **`http://localhost:4000`**.

Những lần sau muốn bật lại, bạn chỉ cần mở Terminal và gõ đúng 1 từ:
```bash
smartmac
```
*(Hoặc chạy ở cổng khác nếu muốn: `smartmac --port 4050`)*

---

### Trên Windows 10 / 11
Mở **PowerShell**, dán dòng lệnh dưới đây rồi nhấn **Enter**:
```powershell
irm https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.ps1 | iex
```
*(Hoặc nếu đã tải thư mục code về máy Windows, bạn chỉ cần nhấp đúp vào file **`start-windows.bat`** để chạy).*

---

## 3. Cài thành Ứng dụng Desktop macOS (Tự chạy khi bật máy)

Nếu bạn dùng **MacBook / iMac**, bạn có thể biến SmartMac thành ứng dụng riêng nằm trong thư mục **Applications** (`/Applications/SmartMac.app`), có icon trên thanh **Menu Bar** và **tự động khởi động mỗi khi bạn bật máy**:

```bash
# Bước 1: Vào thư mục đã cài (hoặc thư mục vừa git clone)
cd ~/.smartmac-agent

# Bước 2: Chạy lệnh cài đặt Desktop App + Tự khởi động cùng macOS
npm run desktop:install
```

**Sau khi chạy xong:**
- Mở **Spotlight** (`Cmd + Space`) gõ `SmartMac` là mở được ngay như các app bình thường khác.
- Khi nhấn dấu `X` đóng cửa sổ, ứng dụng sẽ thu nhỏ lên **thanh Menu Bar (icon hình con chip CPU ở góc trên phải màn hình)** để tiếp tục theo dõi máy và báo Gmail.
- Nhấp vào icon CPU trên Menu Bar để:
  - **Open SmartMac Dashboard**: Mở lại giao diện chính.
  - **Launch at Login**: Tích chọn để bật/tắt tự khởi động khi mở máy.
  - **Quit SmartMac**: Tắt hoàn toàn cả ứng dụng và server ngầm.
- Muốn gỡ cài đặt Desktop App:
  ```bash
  npm run desktop:uninstall
  ```

---

## 4. Cài đặt thủ công từng bước (Dành cho lập trình viên)

Nếu bạn muốn tự tải code về một thư mục bất kỳ để xem hoặc chỉnh sửa:

```bash
# Bước 1: Tải mã nguồn từ GitHub
git clone https://github.com/ngohoang211020/smartmac-agent.git
cd smartmac-agent

# Bước 2: Cài đặt thư viện chạy ứng dụng
npm install --omit=dev

# Bước 3: Khởi chạy ứng dụng (tự mở http://localhost:4000)
npm start
```

> **Chế độ lập trình (sửa code giao diện React / Backend TypeScript):**
> ```bash
> npm install        # Cài đủ thư viện dev (Vite, TypeScript)
> npm run dev        # Chạy dev mode (Web: localhost:5173 | API: localhost:4000)
> npm run build      # Đóng gói lại bản production trước khi push code
> ```

---

## 5. Hướng dẫn kết nối Gmail qua Google OAuth 2.0 (Từng bước)

Tính năng này giúp bạn đọc hộp thư Gmail, gửi email nhanh và nhận thông báo **email chưa đọc trong 3 ngày gần nhất** ở biểu tượng **Chuông (`🔔`)** trên thanh tiêu đề:

1. **Bật Gmail API:**
   - Truy cập [Google Cloud Console — Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) và nhấn **Enable (Bật)**.
2. **Tạo OAuth 2.0 Client ID:**
   - Vào [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials) → chọn **+ Create Credentials** → **OAuth client ID**.
   - **Application type:** Chọn `Web application`.
   - **Name:** Đặt tên là `SmartMac`.
   - **Authorized redirect URIs:** Thêm 2 dòng sau:
     ```text
     http://localhost:4000/api/social/gmail/oauth/callback
     http://localhost:4545/api/social/gmail/oauth/callback
     ```
   - Nhấn **Create** rồi copy **Client ID** và **Client Secret**.
3. **Thêm email được phép đăng nhập (nếu App đang ở chế độ Testing):**
   - Ở menu trái chọn **Audience** → kéo xuống mục **Test users** → nhấn **+ Add users** → nhập địa chỉ Gmail của bạn → nhấn **Save**.
4. **Đăng nhập trên SmartMac:**
   - Mở SmartMac → vào mục **Cloud, Gmail & VPS → Gmail OAuth2**.
   - Dán **Client ID** và **Client Secret** → nhấn **Save Credentials** → nhấn **Sign in with Google OAuth 2.0**.

---

## 6. Bảo mật (Tích hợp sẵn 5 lớp bảo vệ)

Vì ứng dụng có quyền điều khiển tệp tin, ứng dụng và SSH trên máy của bạn, SmartMac được khóa bảo mật ngay từ mặc định:

1. **Chỉ chạy nội bộ trên máy bạn (`127.0.0.1`):** Người lạ dùng chung Wi-Fi quán cà phê hoặc văn phòng **không thể** truy cập vào máy bạn.
2. **Chặn trang web độc hại (Anti-CSRF & Anti-DNS-Rebinding):** Tự động chặn mọi yêu cầu từ các tab web lạ bên ngoài gọi lén vào `localhost`.
3. **Khóa mã PIN Quản trị (Icon Khiên `🛡️` trên thanh tiêu đề):** Bạn có thể đặt mật khẩu/mã PIN cá nhân để khóa toàn bộ giao diện quản trị (mã hóa SHA-256).
4. **Chống lỗi chèn lệnh (Command Injection):** Mọi lệnh hệ thống đều chạy qua `execFile` an toàn thay vì nối chuỗi shell.
5. **Khóa quyền tệp cấu hình (`chmod 0600`):** Token Gmail, danh sách VPS và mã PIN chỉ lưu cục bộ trên máy bạn, chỉ tài khoản máy bạn mới đọc được và không bao giờ bị đẩy lên GitHub.

---

## 7. Danh sách các tính năng chính

| Nhóm tính năng | Chi tiết |
| :--- | :--- |
| **Hệ thống & Phần cứng** | Biểu đồ tròn phân bổ CPU/RAM/Ổ cứng, theo dõi từng nhân CPU theo thời gian thực (2 giây/lần), tình trạng Pin & Uptime. |
| **Ứng dụng & Tiến trình** | Xem tiến trình đang tốn CPU/RAM kèm **icon thật của từng ứng dụng**, tắt tiến trình, mở/đóng ứng dụng, và **Gỡ cài đặt ứng dụng** kèm tùy chọn dọn rác `~/Library`. |
| **Chụp & Quay Màn Hình (`REC`)** | Chụp toàn màn hình / chọn vùng, **Quay video màn hình 30fps** (có thể thu kèm mic), **Ghi âm giọng nói** — tự động lưu vào `~/Desktop/SmartMac-Captures` và xem/nghe lại ngay trên web. |
| **Tệp tin & Thư mục** | Duyệt nhanh Desktop, Downloads, Documents, ổ C/Applications; xem & sửa trực tiếp file text/code, tạo thư mục, chuyển vào Thùng rác hoặc mở bằng Finder/Explorer. |
| **Wi-Fi & Mạng** | Xem tên Wi-Fi đang kết nối, Gateway, DNS, tốc độ tải lên/xuống trực tiếp, quét mạng Wi-Fi xung quanh, bật/tắt Wi-Fi và kiểm tra Ping. |
| **Gmail OAuth 2.0** | Đồng bộ email chưa đọc 3 ngày gần nhất trên icon Chuông (`🔔`), nhấp vào từng email để mở thẳng trong Gmail, soạn & gửi email nhanh, hỗ trợ Reset Session để đổi tài khoản. |
| **VPS & Remote SSH (`PRO`)** | Lưu danh sách máy chủ VPS, mở cửa sổ Terminal SSH gốc của máy chỉ với 1 click, hoặc chạy nhanh lệnh kiểm tra Docker / RAM / Disk / Nginx từ xa. |
| **Camera An Ninh (`Imou & Tapo`)** | Tích hợp trực tiếp **Imou Life HD** & **TP-Link Tapo** qua giao thức RTSP cục bộ (kèm công cụ **Quét Camera LAN** tìm IP tự động, lưới xem nhiều camera 1×1 / 2×2 / 3×3 và chụp ảnh nhanh). |
| **Trợ lý AI Super Agent** | Chat bằng ngôn ngữ tự nhiên để điều khiển máy tính (`check system health`, `open Safari`, `ping 1.1.1.1`, `flush dns`...), hỗ trợ thêm khóa Gemini API (tùy chọn). |

---

## Giấy phép
Mã nguồn mở theo giấy phép **MIT License**.
