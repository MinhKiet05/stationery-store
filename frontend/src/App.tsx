import { BrowserRouter, Routes, Route, useParams, useLocation, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from 'react';
import Header from "./components/header/Header";
import Footer from "./components/footer/Footer";
import HomePage from "./pages/homePage/HomePage";
import ProductDetail from "./pages/productDetail/ProductDetail";
import Login from "./pages/login/Login";
import ForgotPassword from "./pages/forgotPassword/ForgotPassword";
import AboutUs from "./pages/aboutUs/AboutUs";
import Policy from "./pages/policy/Policy";
import SearchPage from "./pages/searchPage/SearchPage";
import AiChatWidget from "./components/aiChat/AiChatWidget";
import MyProfile from "./pages/myProfile/MyProfile";
import AccountInfoTab from "./pages/myProfile/tabs/AccountInfoTab";
import OrderHistoryTab from "./pages/myProfile/tabs/OrderHistoryTab";
import SecurityTab from "./pages/myProfile/tabs/SecurityTab";
import WishlistTab from "./pages/myProfile/tabs/WishlistTab";
import AppNotifications from "./components/notifications/AppNotifications";
const AdminRoute = lazy(() => import('./routes/AdminRoute.jsx'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout.jsx'));
const OverviewPage = lazy(() => import('./pages/dashboard/OverviewPage.jsx'));
const DashboardPlaceholder = lazy(() => import('./pages/dashboard/DashboardPlaceholder.jsx'));
// Layout chung cho các trang có Header & Footer
function MainLayout() {
  return (
    <>
      <Header cartCount={3} />
      <Outlet />
      <Footer />
    </>
  );
}

function StoreChat() {
  const { pathname } = useLocation();
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/') ? null : <AiChatWidget />;
}

// Wrapper lấy param :handle truyền vào ProductDetail
function ProductDetailWrapper() {
  const { handle = "" } = useParams();
  return <ProductDetail handle={decodeURIComponent(handle)} />;
}

function ResetPasswordRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/forgot-password", search, hash }} replace />;
}

function ProductSearchRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/search", search, hash }} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Suspense fallback={<div role="status">Đang tải khu vực quản trị…</div>}><AdminRoute /></Suspense>}>
          <Route element={<DashboardLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="reviews" element={<DashboardPlaceholder title="Đánh giá" />} />
            <Route path="promotions" element={<DashboardPlaceholder title="Khuyến mãi & Voucher" />} />
            <Route path="returns" element={<DashboardPlaceholder title="Trả hàng" />} />
            <Route path="orders" element={<DashboardPlaceholder title="Đơn hàng & Vận chuyển" />} />
            <Route path="products" element={<DashboardPlaceholder title="Sản phẩm & Tồn kho" />} />
            <Route path="users" element={<DashboardPlaceholder title="Người dùng" />} />
            <Route path="*" element={<DashboardPlaceholder title="Trang quản trị" />} />
          </Route>
        </Route>
        {/* Nhóm trang có Header & Footer */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/policy" element={<Policy />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/products" element={<ProductSearchRedirect />} />
          <Route path="/products/:handle" element={<ProductDetailWrapper />} />
          <Route path="/my-profile" element={<MyProfile />}>
            <Route index element={<AccountInfoTab />} />
            <Route path="orders" element={<OrderHistoryTab />} />
            <Route path="wishlist" element={<WishlistTab />} />
            <Route path="security" element={<SecurityTab />} />
          </Route>
          <Route path="/profile" element={<Navigate to="/my-profile" replace />} />
          <Route path="/orders" element={<Navigate to="/my-profile/orders" replace />} />
        </Route>

        {/* Nhóm trang Auth độc lập */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPasswordRedirect />} />
      </Routes>

      <StoreChat />
      <AppNotifications />
    </BrowserRouter>
  );
}

export default App;
