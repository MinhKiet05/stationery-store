import energel from "../../assets/catalog/pentel-energel.webp";
import frixion from "../../assets/catalog/pilot-frixion.webp";
import pastel from "../../assets/catalog/deli-pastel.webp";
import safari from "../../assets/catalog/lamy-safari.webp";
import gel from "../../assets/catalog/thien-long-gel.webp";
import brush from "../../assets/catalog/marvy-brush.webp";
import uni from "../../assets/catalog/uni-ball-one.webp";
import custom from "../../assets/catalog/custom-pens.webp";
import graphgear from "../../assets/catalog/pentel-graphgear.webp";
import marker from "../../assets/catalog/thien-long-marker.webp";
import refill from "../../assets/catalog/pentel-refill.webp";
import calligraphy from "../../assets/catalog/kuretake-calligraphy.webp";

export type CatalogProduct = {
  id: string;
  title: string;
  brand: string;
  origin: string;
  category: string;
  image: string;
  price: number;
  oldPrice: number;
  rating: number;
  sold: number;
  badge?: string;
  inStock: boolean;
  express: boolean;
};

export const categories = [
  { id: "all", label: "Tất cả Bút & Mực" },
  { id: "gel", label: "Bút Gel & Bút Bi nước" },
  { id: "fountain", label: "Bút Máy & Mực Bơm" },
  { id: "highlighter", label: "Bút Dạ Quang / Pastel" },
  { id: "brush", label: "Bút Lông & Brush Pen" },
  { id: "pencil", label: "Bút Chì & Ruột Bút" },
];

// Dữ liệu giao diện lấy từ thiết kế SVG; chưa kết nối danh mục/giỏ hàng backend.
export const catalogProducts: CatalogProduct[] = [
  {
    id: "energel",
    title: "Bút gel Pentel EnerGel BL77 0.7mm mực khô nhanh cao cấp",
    brand: "Pentel",
    origin: "NHẬT BẢN",
    category: "gel",
    image: energel,
    price: 42000,
    oldPrice: 56000,
    rating: 4.9,
    sold: 1800,
    badge: "Bán chạy",
    inStock: true,
    express: true,
  },
  {
    id: "frixion",
    title: "Hộp 12 Bút Gel xoá được Pilot Frixion Ball 0.5mm",
    brand: "Pilot (Frixion)",
    origin: "NHẬT BẢN",
    category: "gel",
    image: frixion,
    price: 285000,
    oldPrice: 340000,
    rating: 5,
    sold: 950,
    inStock: true,
    express: true,
  },
  {
    id: "pastel",
    title: "Bộ 6 Bút highlight Deli Pastel ngòi vát đa năng",
    brand: "Deli Official",
    origin: "",
    category: "highlighter",
    image: pastel,
    price: 38000,
    oldPrice: 48000,
    rating: 4.8,
    sold: 3200,
    badge: "Top Trend",
    inStock: true,
    express: true,
  },
  {
    id: "safari",
    title: "Bút máy Lamy Safari ngòi F kèm ống mực chuẩn",
    brand: "Lamy",
    origin: "ĐỨC",
    category: "fountain",
    image: safari,
    price: 460000,
    oldPrice: 520000,
    rating: 4.9,
    sold: 410,
    badge: "Cao cấp",
    inStock: true,
    express: false,
  },
  {
    id: "gel08",
    title: "Set 5 Bút Bi Thiên Long Gel-08 Sunbeam mực xanh",
    brand: "Thiên Long",
    origin: "VN",
    category: "gel",
    image: gel,
    price: 25000,
    oldPrice: 30000,
    rating: 4.7,
    sold: 5400,
    inStock: true,
    express: true,
  },
  {
    id: "marvy",
    title: "Bút lông cọ Brush Pen Marvy Uchida Le Plume II",
    brand: "Marvy Uchida",
    origin: "",
    category: "brush",
    image: brush,
    price: 55000,
    oldPrice: 65000,
    rating: 4.8,
    sold: 820,
    inStock: true,
    express: false,
  },
  {
    id: "uniball",
    title: "Bút gel bấm Uni-ball One màu mực đậm chống phai",
    brand: "Uni-ball Mitsubishi",
    origin: "JAPAN",
    category: "gel",
    image: uni,
    price: 45000,
    oldPrice: 55000,
    rating: 4.9,
    sold: 1100,
    badge: "Mới về",
    inStock: true,
    express: true,
  },
  {
    id: "custom",
    title: "Bộ 10 Bút Bi nắp vặn kim loại khắc tên theo yêu cầu",
    brand: "StationeryStore Custom",
    origin: "",
    category: "gel",
    image: custom,
    price: 189000,
    oldPrice: 240000,
    rating: 4.8,
    sold: 630,
    inStock: false,
    express: false,
  },
  {
    id: "graphgear",
    title: "Bút chì kim Pentel GraphGear 1000 kim loại 0.5mm",
    brand: "Pentel",
    origin: "NHẬT BẢN",
    category: "pencil",
    image: graphgear,
    price: 175000,
    oldPrice: 210000,
    rating: 5,
    sold: 1400,
    inStock: true,
    express: true,
  },
  {
    id: "marker",
    title: "Bút dạ kẻ bảng trắng Thiên Long WB-03 xoá sạch",
    brand: "Thiên Long",
    origin: "VN",
    category: "brush",
    image: marker,
    price: 18000,
    oldPrice: 22000,
    rating: 4.6,
    sold: 4200,
    inStock: true,
    express: true,
  },
  {
    id: "refill",
    title: "Hộp 10 Ruột bút Pentel EnerGel LR7 0.7mm thay thế",
    brand: "Pentel",
    origin: "NHẬT BẢN",
    category: "pencil",
    image: refill,
    price: 150000,
    oldPrice: 180000,
    rating: 4.9,
    sold: 2100,
    badge: "Tiết kiệm",
    inStock: true,
    express: true,
  },
  {
    id: "kuretake",
    title: "Set Bút thư pháp Calligraphy Kuretake Nhật Bản",
    brand: "Kuretake",
    origin: "JAPAN",
    category: "brush",
    image: calligraphy,
    price: 210000,
    oldPrice: 260000,
    rating: 4.9,
    sold: 590,
    inStock: true,
    express: false,
  },
];

export const money = (amount: number) =>
  `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
