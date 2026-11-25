import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, FileText, Headphones, Mail, Phone, RotateCcw, Search, ShieldCheck, Truck } from "lucide-react";
import styles from "./Policy.module.css";

type Section = { title: string; intro?: string; layout?: "cards" | "steps"; items: { title: string; text: string; note?: string }[] };
type PolicyDocument = { id: string; title: string; subtitle: string; badge?: string; heading: string; notice: string; sections: Section[] };
const documents: PolicyDocument[] = [
  {
    id: "returns", title: "Đổi trả & Hoàn tiền", subtitle: "Tích hợp yêu cầu hoàn tiền UC014", badge: "7 Ngày", heading: "Chính sách Đổi trả & Hoàn tiền trong vòng 07 ngày",
    notice: "Tại StationeryStore, khách hàng không cần gọi điện thoại đôi co hay chờ đợi email giải trình. Quý khách có thể tự tạo Yêu cầu trả hàng trực tuyến (UC014) ngay trong mục Quản lý đơn hàng. Hệ thống điều phối Shipper GHN đến tận cửa nhà thu hồi kiện hàng hoàn toàn miễn phí.",
    sections: [
      { title: "Điều kiện chấp nhận đổi trả", intro: "Khách hàng được quyền đổi sang sản phẩm mới tương đương hoặc nhận hoàn tiền 100% nếu sản phẩm đáp ứng đầy đủ các tiêu chí tiêu chuẩn sau:", layout: "cards", items: [
        { title: "Lỗi kỹ thuật từ nhà sản xuất", text: "Ngòi bút máy bị gai mực, rò rỉ ron piston, sổ tay rách gáy chỉ may, giấy bìa lem nhem hoặc giấy in bị quăn mép khi vừa bóc tem." },
        { title: "Giao sai chủng loại & Mã hàng", text: "Giao nhầm mã màu thân bút (vd: Navy thay vì Bạc), sai định lượng giấy (80gsm thay vì 100gsm) hoặc thiếu phụ kiện quà tặng đi kèm." },
        { title: "Thời hạn quy định 07 ngày", text: "Yêu cầu được kích hoạt trong vòng 07 ngày (168 giờ) kể từ khi đối tác vận chuyển bàn giao thành công theo trạng thái đơn hàng điện tử." },
        { title: "Tính nguyên vẹn của hàng hoá", text: "Sản phẩm còn nguyên tem mác thương hiệu, tem niêm phong chống hàng giả, vỏ hộp bảo vệ không bị rách nát và kèm theo hóa đơn/phiếu xuất kho." },
      ] },
      { title: "Các trường hợp từ chối đổi trả", intro: "Để bảo đảm công bằng và duy trì tiêu chuẩn vệ sinh, chất lượng hoàn hảo cho cộng đồng sưu tầm văn phòng phẩm, chúng tôi xin phép từ chối yêu cầu đổi trả đối với các danh mục sau:", items: [
        { title: "Quá thời hạn quy định", text: "Các yêu cầu khởi tạo sau 07 ngày kể từ thời điểm kiện hàng hiển thị trạng thái phát hàng thành công." },
        { title: "Hư hại do tác động ngoại lực cá nhân", text: "Bút bị rơi gãy ngòi, rơi vỡ thân nhựa resin, ruột bút bị dùng cạn mực, sổ tay bị dính nước ẩm ướt hoặc làm rách trang giấy trong quá trình sử dụng của khách." },
        { title: "Sản phẩm gia công cá nhân hóa (Bespoke Services)", text: "Bút máy đã được chạm khắc tên/logo cá nhân bằng tia laser; sổ tay đặt in dập chìm tên riêng; hoặc phí dịch vụ bọc quà gói nghệ thuật theo yêu cầu thủ công đã thực hiện xong." },
      ] },
      { title: "Quy trình 3 bước trả hàng Online tiện lợi (UC014)", intro: "Không cần phiếu giấy phức tạp, quy trình trả hàng được xử lý đồng bộ và thông báo tiến độ trực tiếp qua SMS & Email của quý khách:", layout: "steps", items: [
        { title: "Gửi yêu cầu trực tuyến", text: "Đăng nhập tài khoản, vào “Lịch sử đơn hàng” → Chọn đơn cần hoàn → Nhấn nút “Yêu cầu trả hàng (UC014)”. Tải lên 1–3 bức ảnh chụp góc độ lỗi sản phẩm và mã vận đơn.", note: "Thời gian điền: ~2 phút" },
        { title: "Shipper GHN thu hồi tận nơi", text: "Hệ thống tự động duyệt trong 2 giờ làm việc và kích hoạt phiếu thu hồi ngược. Bưu tá GHN sẽ mang túi niêm phong chuyên dụng đến tận nhà quý khách lấy hàng trong vòng 24 giờ mà không phát sinh thêm chi phí.", note: "Thu hồi miễn phí toàn quốc" },
        { title: "Hoàn tiền hoặc Nhận Voucher", text: "Ngay khi kiện hàng về kho kiểm định, khoản tiền 100% được hoàn về Ví MoMo / Tài khoản ngân hàng trong 24h, hoặc quý khách có thể chọn Voucher mua sắm tặng thêm +10% giá trị đơn hàng.", note: "Tặng thêm 10% nếu chọn Voucher" },
      ] },
      { title: "Chi phí vận chuyển đổi trả", layout: "cards", items: [
        { title: "Lỗi phát sinh từ StationeryStore", text: "Chúng tôi chịu 100% chi phí vận chuyển 2 chiều (bao gồm phí Shipper lấy hàng ngược và phí gửi kiện mới thay thế)." },
        { title: "Nhu cầu chủ quan từ khách hàng", text: "Trường hợp đổi màu thân bút hoặc đổi mẫu sổ vì thay đổi sở thích cá nhân, khách hàng vui lòng hỗ trợ cước phí chuyển phát theo biểu phí GHN (đồng giá 25.000đ)." },
      ] },
    ],
  },
  {
    id: "shipping", title: "Giao hàng & Đồng kiểm", subtitle: "Quy chế kiểm hàng trước khi nhận", heading: "Chính sách Giao hàng & Quyền Đồng kiểm",
    notice: "Kiểm tra an tâm trước khi nhận hàng. StationeryStore phối hợp cùng GHN đóng gói và giao sản phẩm đến địa chỉ quý khách cung cấp. Hãy giữ lại mã vận đơn để thuận tiện tra cứu và hỗ trợ khi cần.",
    sections: [
      { title: "Phạm vi & Thời gian giao hàng", layout: "cards", items: [
        { title: "Giao hàng toàn quốc", text: "Áp dụng cho các địa chỉ thuộc phạm vi phục vụ của GHN. Quý khách cần cung cấp đầy đủ tên người nhận, số điện thoại và địa chỉ giao hàng chính xác." },
        { title: "Thời gian dự kiến", text: "Nội thành: 1–2 ngày làm việc. Các tỉnh thành khác: 3–5 ngày làm việc sau khi xác nhận đơn. Khu vực xa, ngày lễ hoặc thời tiết bất lợi có thể phát sinh thời gian giao thêm." },
      ] },
      { title: "Phí vận chuyển & Đóng gói", items: [
        { title: "Ưu đãi miễn phí vận chuyển", text: "Miễn phí vận chuyển cho đơn hàng từ 200.000đ. Với đơn hàng chưa đạt mức ưu đãi, phí giao hàng được thông báo khi xác nhận đơn và trước khi thanh toán." },
        { title: "Bảo vệ từng sản phẩm", text: "Bút và phụ kiện được bọc chống va đập; sổ, giấy được bảo vệ mép và chống ẩm. Đơn quà tặng cần được ghi chú trước khi cửa hàng đóng gói." },
      ] },
      { title: "Quyền đồng kiểm cùng bưu tá", layout: "steps", items: [
        { title: "Kiểm tra kiện hàng", text: "Kiểm tra mã vận đơn, tên người nhận, niêm phong và tình trạng hộp. Nếu kiện bị móp nặng hoặc ướt, hãy chụp ảnh trước khi mở." },
        { title: "Đối chiếu sản phẩm", text: "Mở kiện cùng bưu tá để đếm số lượng, đối chiếu mã hàng, màu sắc và tình trạng ngoại quan. Không bơm mực vào bút, viết thử lên giấy hoặc bóc tem sản phẩm." },
        { title: "Xác nhận hoặc từ chối", text: "Nhận hàng khi thông tin chính xác. Nếu rách vỡ, giao sai hoặc thiếu hàng, quý khách có thể từ chối nhận và liên hệ CSKH để được xử lý." },
      ] },
      { title: "Giao không thành công & Thay đổi địa chỉ", items: [
        { title: "Khi không thể nhận hàng", text: "Giữ điện thoại liên lạc và trao đổi lịch giao lại với bưu tá. Nếu giao nhiều lần không thành công, đơn có thể được hoàn về kho; CSKH sẽ hỗ trợ xác nhận phương án tiếp theo." },
        { title: "Thay đổi thông tin giao nhận", text: "Liên hệ hotline sớm nhất khi cần đổi người nhận hoặc địa chỉ. Với kiện đã bàn giao cho GHN, khả năng thay đổi và phí phát sinh sẽ được xác nhận trước khi thực hiện." },
      ] },
    ],
  },
  {
    id: "privacy", title: "Bảo mật thông tin", subtitle: "Bảo vệ dữ liệu và tài khoản", badge: "Bảo mật", heading: "Chính sách Bảo mật Thông tin Khách hàng",
    notice: "Thông tin của bạn được sử dụng để phục vụ giao dịch và hỗ trợ khách hàng. StationeryStore không mua bán dữ liệu cá nhân và chỉ chia sẻ thông tin cần thiết với đơn vị tham gia xử lý đơn hàng.",
    sections: [
      { title: "Thông tin được thu thập", layout: "cards", items: [
        { title: "Tài khoản & Giao nhận", text: "Tên đăng nhập, họ tên, email, số điện thoại, địa chỉ giao hàng và lịch sử đơn hàng được dùng để quản lý tài khoản, xác nhận và giao đơn." },
        { title: "Tương tác & Sở thích mua sắm", text: "Lượt xem sản phẩm, tìm kiếm, đánh giá và tương tác với trợ lý mua sắm giúp gợi ý bút, sổ và văn phòng phẩm phù hợp. Không gửi mật khẩu hoặc thông tin thẻ trong nội dung trò chuyện." },
      ] },
      { title: "Mục đích sử dụng & Phạm vi chia sẻ", items: [
        { title: "Phục vụ đơn hàng và chăm sóc khách hàng", text: "Thông tin được dùng để xác thực tài khoản, xử lý thanh toán, giao nhận, đổi trả, bảo hành và giải quyết phản ánh. Nội dung tiếp thị chỉ được gửi theo lựa chọn đăng ký của khách hàng." },
        { title: "Đơn vị vận chuyển và thanh toán", text: "GHN chỉ nhận thông tin cần cho giao nhận. Đơn vị thanh toán nhận dữ liệu phục vụ giao dịch theo phương thức quý khách lựa chọn. Thông tin cũng có thể được cung cấp khi có yêu cầu hợp lệ của cơ quan có thẩm quyền." },
      ] },
      { title: "Bảo vệ tài khoản & Giao dịch", items: [
        { title: "Mật khẩu và phiên đăng nhập", text: "Dùng mật khẩu riêng, không chia sẻ tài khoản và đăng xuất khi sử dụng thiết bị công cộng. Khi quên mật khẩu, sử dụng chức năng khôi phục bằng email đã đăng ký." },
        { title: "An toàn thanh toán", text: "Không cung cấp OTP, mật khẩu ví hoặc mã bảo mật thẻ cho bất kỳ ai tự nhận là nhân viên cửa hàng. Kiểm tra số tiền và thông tin người nhận trước khi xác nhận giao dịch." },
      ] },
      { title: "Quyền của khách hàng & Thời gian lưu trữ", items: [
        { title: "Tra cứu, chỉnh sửa và yêu cầu hỗ trợ", text: "Quý khách có thể yêu cầu kiểm tra, cập nhật hoặc xóa thông tin cá nhân qua cskh@stationerystore.vn. Chúng tôi có thể cần xác minh chủ tài khoản để bảo vệ dữ liệu của bạn." },
        { title: "Lưu trữ và xóa dữ liệu", text: "Dữ liệu được lưu trong thời gian cần thiết để cung cấp dịch vụ, giải quyết khiếu nại và thực hiện nghĩa vụ lưu trữ giao dịch. Yêu cầu xóa được xử lý phù hợp với các nghĩa vụ này." },
      ] },
    ],
  },
  {
    id: "terms", title: "Điều khoản dịch vụ", subtitle: "Quyền sở hữu trí tuệ & Hành vi đặt hàng", heading: "Điều khoản Sử dụng & Giao dịch",
    notice: "Khi sử dụng StationeryStore, quý khách vui lòng đọc và tuân thủ các điều khoản dưới đây. Mọi giao dịch cần dựa trên thông tin chính xác, sự tôn trọng và quyền lợi của cả khách hàng lẫn cửa hàng.",
    sections: [
      { title: "Tài khoản & Trách nhiệm sử dụng", items: [
        { title: "Thông tin đăng ký chính xác", text: "Khách hàng chịu trách nhiệm về thông tin đăng ký, địa chỉ và số điện thoại nhận hàng. Bảo vệ thông tin đăng nhập và thông báo ngay cho CSKH khi phát hiện tài khoản bị sử dụng trái phép." },
        { title: "Hành vi được chấp nhận", text: "Không giả mạo người khác, tạo đơn hàng giả, khai thác lỗi hệ thống, phát tán nội dung độc hại hoặc can thiệp vào hoạt động của website. Cửa hàng có thể tạm ngưng tài khoản có dấu hiệu lạm dụng để xác minh." },
      ] },
      { title: "Đặt hàng, Giá bán & Thanh toán", layout: "cards", items: [
        { title: "Xác nhận đơn hàng", text: "Kiểm tra biến thể, màu sắc, số lượng và địa chỉ trước khi đặt hàng. Đơn hàng được xử lý sau khi cửa hàng xác nhận thông tin và khả năng cung ứng sản phẩm." },
        { title: "Giá bán và ưu đãi", text: "Giá sản phẩm và mã giảm giá được áp dụng theo điều kiện tại thời điểm đặt hàng. Mỗi ưu đãi có thời hạn, giá trị tối thiểu hoặc giới hạn lượt dùng riêng; phí phát sinh phải được thông báo trước khi xác nhận." },
        { title: "Phương thức thanh toán", text: "Chọn phương thức được hỗ trợ tại bước thanh toán. Với giao dịch chưa ghi nhận thành công, liên hệ CSKH kèm mã đơn và chứng từ; không thanh toán lặp lại khi chưa kiểm tra." },
        { title: "Điều chỉnh hoặc hủy đơn", text: "Liên hệ sớm trước khi đơn được đóng gói hoặc giao cho vận chuyển. Đơn đã giao được xử lý theo chính sách đổi trả và tình trạng thực tế của sản phẩm." },
      ] },
      { title: "Nội dung, Đánh giá & Sở hữu trí tuệ", items: [
        { title: "Quyền sở hữu nội dung", text: "Hình ảnh, mô tả sản phẩm, thiết kế và nhận diện StationeryStore được dùng để giới thiệu sản phẩm. Việc sao chép để sử dụng thương mại cần có sự cho phép của chủ sở hữu tương ứng." },
        { title: "Đánh giá sản phẩm và trợ lý mua sắm", text: "Đánh giá cần phản ánh trải nghiệm thực tế, không chứa nội dung xúc phạm hay thông tin cá nhân của người khác. Gợi ý từ trợ lý AI mang tính tham khảo; hãy kiểm tra thông số, giá và tồn kho trên trang sản phẩm trước khi đặt hàng." },
      ] },
      { title: "Cập nhật điều khoản & Giải quyết tranh chấp", items: [
        { title: "Thông báo thay đổi", text: "Nội dung điều khoản có thể được cập nhật để phù hợp với hoạt động cửa hàng. Các vấn đề của đơn hàng đã xác nhận được đối chiếu với thông tin giao dịch và chính sách áp dụng khi đặt hàng." },
        { title: "Ưu tiên trao đổi và hỗ trợ", text: "Khi phát sinh bất đồng, vui lòng gửi mã đơn, nội dung phản ánh và tài liệu liên quan qua email CSKH. Hai bên ưu tiên trao đổi và thống nhất phương án xử lý phù hợp." },
      ] },
    ],
  },
  {
    id: "warranty", title: "Bảo hành & Khiếu nại", subtitle: "Bút máy kim loại, máy tính cầm tay", heading: "Chính sách Bảo hành & Tiếp nhận Khiếu nại",
    notice: "Mỗi sản phẩm có điều kiện bảo hành riêng theo thương hiệu và chứng từ mua hàng. StationeryStore đồng hành trong quá trình kiểm tra, tiếp nhận và chuyển sản phẩm đến đơn vị bảo hành phù hợp.",
    sections: [
      { title: "Phạm vi & Thời hạn bảo hành", layout: "cards", items: [
        { title: "Bút ký và bút máy cao cấp", text: "Bút Pilot, Lamy, Kaweco, Parker được xem xét bảo hành lỗi kỹ thuật theo phiếu bảo hành của từng dòng sản phẩm. Thời hạn thường từ 12–24 tháng nếu được ghi nhận trên chứng từ mua hàng." },
        { title: "Máy tính cầm tay & Dụng cụ", text: "Máy tính Casio và dụng cụ có bảo hành được áp dụng theo điều kiện của nhà sản xuất. Kiểm tra số sê-ri, tem và phiếu bảo hành đi kèm để xác định thời hạn cụ thể." },
      ] },
      { title: "Điều kiện tiếp nhận & Trường hợp loại trừ", items: [
        { title: "Hồ sơ cần có", text: "Cung cấp mã đơn hoặc hóa đơn, phiếu bảo hành (nếu có), ảnh/video mô tả lỗi và các phụ kiện liên quan. Sản phẩm cần còn nhận diện được nguồn gốc và trong thời hạn bảo hành." },
        { title: "Trường hợp không thuộc bảo hành", text: "Hao mòn tự nhiên, hết mực, pin tiêu hao, rơi vỡ, vào nước, dùng sai hướng dẫn hoặc tự ý tháo sửa không thuộc phạm vi bảo hành lỗi sản xuất. Phương án sửa có phí chỉ thực hiện sau khi khách hàng đồng ý." },
      ] },
      { title: "Quy trình tiếp nhận bảo hành", layout: "steps", items: [
        { title: "Gửi thông tin sản phẩm", text: "Liên hệ hotline hoặc email CSKH, cung cấp mã đơn và mô tả lỗi. Nhân viên hướng dẫn kiểm tra ban đầu và chuẩn bị hồ sơ." },
        { title: "Kiểm tra & Xác nhận", text: "Gửi sản phẩm theo hướng dẫn sau khi được xác nhận tiếp nhận. Cửa hàng kiểm tra và thông báo điều kiện, chi phí nếu có cùng thời gian xử lý dự kiến." },
        { title: "Nhận lại sản phẩm", text: "Sản phẩm được sửa, thay thế hoặc xử lý theo kết luận của đơn vị bảo hành. CSKH liên hệ xác nhận địa chỉ và phương án bàn giao." },
      ] },
      { title: "Khiếu nại & Góp ý dịch vụ", items: [
        { title: "Kênh tiếp nhận chính thức", text: "Gọi 1900 6868 trong khung giờ 8:00–21:00 (T2–CN) hoặc gửi email cskh@stationerystore.vn. Đính kèm mã đơn, thông tin liên hệ, mô tả sự việc và ảnh/chứng từ liên quan." },
        { title: "Theo dõi và giải quyết", text: "CSKH xác nhận thông tin và phản hồi phương án sau khi kiểm tra. Các trường hợp cần phối hợp với vận chuyển hoặc nhà sản xuất sẽ được thông báo tiến độ; không yêu cầu khách hàng cung cấp OTP hay mật khẩu." },
      ] },
    ],
  },
];
const icons = [RotateCcw, Truck, ShieldCheck, FileText, Headphones];
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

export default function Policy() {
  const { hash } = useLocation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => hash.slice(1) || "returns");
  const [previousHash, setPreviousHash] = useState(hash);
  if (previousHash !== hash) {
    setPreviousHash(hash);
    setSelected(hash.slice(1) || "returns");
    setQuery("");
  }
  useEffect(() => {
    const previous = document.title;
    document.title = "Chính sách & Điều khoản | StationeryStore";
    return () => { document.title = previous; };
  }, []);
  const results = documents.filter(doc => normalize([doc.title, doc.subtitle, doc.notice, ...doc.sections.flatMap(s => [s.title, s.intro ?? "", ...s.items.flatMap(i => [i.title, i.text])])].join(" ")).includes(normalize(query.trim())));
  const active = results.find(doc => doc.id === selected) ?? results[0];
  return <main className={styles.page}>
    <section className={styles.hero}><div className={styles.heroInner}><div><span className={styles.eyebrow}><ShieldCheck size={14} /> CAM KẾT MINH BẠCH & BẢO VỆ NGƯỜI TIÊU DÙNG</span><h1>Trung Tâm Chính Sách &<br />Điều Khoản Sử Dụng</h1><p>Tại StationeryStore, chúng tôi tôn vinh sự tinh tế của chất liệu giấy mực và sự công bằng trong từng giao dịch. Mọi quy chuẩn được thiết lập nhằm bảo vệ quyền lợi trọn vẹn, mang lại trải nghiệm mua sắm an tâm và thỏa mãn nhất.</p></div><div className={styles.searchCard}><label htmlFor="policy-search">TRA CỨU NHANH VĂN BẢN</label><div className={styles.searchField}><Search size={19} /><input id="policy-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm đổi trả 7 ngày, UC014, đồng kiểm..." /></div><p>Phổ biến: <button type="button" onClick={() => setQuery("Dổi trả")}></button><span> </span><button type="button" onClick={() => setQuery("đồng kiểm")}>Đồng kiểm GHN</button></p></div></div></section>
    <div className={styles.layout}><aside className={styles.sidebar}><nav className={styles.contents} aria-label="Mục lục văn bản"><div className={styles.contentsTitle}><BookOpen size={17} /><strong>MỤC LỤC VĂN BẢN</strong><span>5 Chính sách</span></div>{documents.map((doc, index) => { const Icon = icons[index]; return <Link key={doc.id} to={`#${doc.id}`} onClick={() => setQuery("")} className={`${styles.navItem} ${active?.id === doc.id ? styles.active : ""}`} aria-current={active?.id === doc.id ? "page" : undefined}><Icon size={19} /><span><strong>{index + 1}. {doc.title}</strong><small>{doc.subtitle}</small></span>{doc.badge && <em>{doc.badge}</em>}</Link>; })}</nav>
      <section className={styles.support}><span className={styles.supportIcon}><Headphones size={25} /></span><h2>Hỗ Trợ Trực Tiếp</h2><p>Chúng tôi luôn sẵn sàng lắng nghe bạn.</p><dl><dt>Hotline</dt><dd><a href="tel:19006868">1900 6868</a></dd><dt>Giờ làm việc</dt><dd>8:00 - 21:00 (T2 - CN)</dd><dt>Email</dt><dd><a href="mailto:cskh@stationerystore.vn">cskh@stationerystore.vn</a></dd></dl><a className={styles.outlineButton} href="mailto:cskh@stationerystore.vn?subject=Khieu%20nai%20va%20gop%20y">Gửi khiếu nại / Góp ý dịch vụ <ArrowRight size={14} /></a></section>
      <div className={styles.trust}><span><RotateCcw size={20} />Đổi 7 ngày<small>Miễn phí thu hồi</small></span><span><ShieldCheck size={20} />Bảo mật<small>Bảo vệ giao dịch</small></span><span><CheckCircle2 size={20} />Chính hãng<small>Cam kết 100%</small></span></div></aside>
      <div className={styles.document} aria-live="polite">{!active ? <div className={styles.empty}><Search size={32} /><h2>Không tìm thấy chính sách</h2><p>Thử từ khóa khác hoặc xem toàn bộ văn bản.</p><button type="button" onClick={() => setQuery("")}>Xóa tìm kiếm</button></div> : <article key={active.id}>
        {query.trim() && <div className={styles.searchResults}><span>{results.length} văn bản phù hợp</span>{results.map(doc => <button type="button" key={doc.id} onClick={() => setSelected(doc.id)} aria-pressed={active.id === doc.id}>{doc.title}</button>)}</div>}
        <header className={styles.documentHeader}><span className={styles.eyebrow}>QUY CHUẨN DỊCH VỤ KHÁCH HÀNG</span><h2>{active.heading}</h2><div className={styles.metadata}><span><Clock3 size={14} /> Cập nhật lần cuối: 20/03/2025</span><span className={styles.badge}>{active.subtitle}</span></div></header>
        <div className={styles.notice}><ShieldCheck size={25} /><div><h3>Cam kết an tâm tuyệt đối <span>{active.id === "returns" ? "Quy trình UC014 số hoá" : "Minh bạch trong từng giao dịch"}</span></h3><p>{active.notice}</p></div></div>
        {active.sections.map((section, index) => <section className={styles.section} key={section.title}><h3><span>{index + 1}.</span> {section.title}</h3>{section.intro && <p>{section.intro}</p>}<div className={section.layout === "steps" ? styles.steps : section.layout === "cards" ? styles.cards : styles.list}>{section.items.map((item, i) => <div key={item.title} className={styles.item}>{section.layout === "steps" ? <span className={styles.stepNumber}>0{i + 1}</span> : section.layout === "cards" ? <CheckCircle2 size={20} /> : null}<h4>{item.title}</h4><p>{item.text}</p>{item.note && <small className={styles.stepNote}><CheckCircle2 size={12} />{item.note}</small>}</div>)}</div></section>)}
        {active.id === "returns" && <section className={styles.section}><h3><span>5.</span> Tóm tắt các chính sách quan trọng khác</h3><p>Các điều khoản tổng quát chi phối hành vi dịch vụ và giao dịch trên nền tảng StationeryStore:</p><div className={styles.summaries}>{documents.slice(1).map(doc => <details key={doc.id}><summary>{doc.title}<small>{doc.subtitle}</small></summary><p>{doc.notice}</p><Link to={`#${doc.id}`}>Đọc toàn bộ chính sách <ArrowRight size={13} /></Link></details>)}</div></section>}
      </article>}</div></div>
    <section className={styles.cta}><div><span className={styles.eyebrow}>ĐỘI NGŨ LUÔN SẴN SÀNG HỖ TRỢ</span><h2>Bạn vẫn còn câu hỏi về chính sách<br />hoặc đơn hàng cụ thể?</h2><p>Mọi thắc mắc của bạn về đổi trả, tình trạng vận chuyển hoặc hỗ trợ kỹ thuật ngòi bút đều được đội ngũ chuyên viên văn phòng phẩm chăm sóc tận tình.</p></div><div className={styles.ctaActions}><a href="mailto:cskh@stationerystore.vn?subject=Yeu%20cau%20tra%20hang%20UC014">Liên hệ yêu cầu trả hàng<ArrowRight size={17} /></a><a href="tel:19006868"><Phone size={17} /> Gọi chuyên viên CSKH</a><Link to="/about-us#contact"><Mail size={14} /> Thông tin liên hệ</Link></div></section>
  </main>;
}
