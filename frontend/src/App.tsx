
import ScrollToTop from './components/ScrollToTop';
import { BrowserRouter, Routes, Route, useParams, useLocation, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense } from 'react';
import Header from "./components/header/Header";
import Footer from "./components/footer/Footer";
import HomePage from "./pages/homePage/HomePage";
import AiChatWidget from "./components/aiChat/AiChatWidget";
import AppNotifications from "./components/notifications/AppNotifications";
import { useAdminSessionEvents } from './services/adminSession';
import useSessionScope from './services/useSessionScope';
import RouteErrorBoundary from './components/RouteErrorBoundary';

const ProductDetail = lazy(() => import('./pages/productDetail/ProductDetail'));
const Login = lazy(() => import('./pages/login/Login'));
const ForgotPassword = lazy(() => import('./pages/forgotPassword/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/forgotPassword/ResetPassword'));
const AboutUs = lazy(() => import('./pages/aboutUs/AboutUs'));
const Policy = lazy(() => import('./pages/policy/Policy'));
const SearchPage = lazy(() => import('./pages/searchPage/SearchPage'));

const MyProfile = lazy(() => import('./pages/myProfile/MyProfile'));
const AccountInfoTab = lazy(() => import('./pages/myProfile/tabs/AccountInfoTab'));
const OrderHistoryTab = lazy(() => import('./pages/myProfile/tabs/OrderHistoryTab'));
const SecurityTab = lazy(() => import('./pages/myProfile/tabs/SecurityTab'));
const WishlistTab = lazy(() => import('./pages/myProfile/tabs/WishlistTab'));

const AdminRoute = lazy(() => import('./routes/AdminRoute.jsx'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout.jsx'));
const OverviewPage = lazy(() => import('./pages/dashboard/OverviewPage.jsx'));
const ReviewsPage = lazy(() => import('./pages/dashboard/ReviewsPage.jsx'));
const PromotionsPage = lazy(() => import('./pages/dashboard/PromotionsPage.jsx'));
const ProductsPage = lazy(() => import('./pages/dashboard/ProductsPage.jsx'));
const UsersPage = lazy(() => import('./pages/dashboard/UsersPage.jsx'));
const OrdersPage = lazy(() => import('./pages/dashboard/OrdersPage.jsx'));
const ReturnsPage = lazy(() => import('./pages/dashboard/ReturnsPage.jsx'));
const NotFound = lazy(() => import('./pages/notFound/NotFound'));
const CartPage = lazy(() => import('./pages/cart/CartPage'));

const ReturnRequest = lazy(() => import('./pages/returnRequest/ReturnRequest'));

// Layout chung cho các trang có Header & Footer
function MainLayout() {
  return (
    <>
      <Header />
      <RouteErrorBoundary><Suspense fallback={<p className="page-loading" role="status">Đang tải trang…</p>}>
        <Outlet />
      </Suspense></RouteErrorBoundary>
      <Footer />
    </>
  );
}

function StoreChat() {
  const { pathname } = useLocation();
  const scope = useSessionScope();

  return pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/')
    ? null
    : <AiChatWidget key={scope} />;
}

// Wrapper lấy param :handle truyền vào ProductDetail
function ProductDetailWrapper() {
  const { handle = "" } = useParams();
  return <ProductDetail handle={handle} />;
}

function AliasRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();

  return (
    <Navigate
      to={{ pathname: to, search, hash }}
      replace
    />
  );
}

function App() {
  useAdminSessionEvents();

  return (
    <BrowserRouter>
      <ScrollToTop />

      <RouteErrorBoundary><Suspense fallback={<p className="page-loading" role="status">Đang tải trang…</p>}>
        <Routes>
          {/* Nhóm trang quản trị */}
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<div role="status">Đang tải khu vực quản trị…</div>}>
                <AdminRoute />
              </Suspense>
            }
          >
            <Route element={<DashboardLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="reviews" element={<ReviewsPage />} />
              <Route path="promotions" element={<PromotionsPage />} />
              <Route path="returns" element={<ReturnsPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route
                path="*"
                element={<NotFound dashboard />}
              />
            </Route>
          </Route>

          {/* Nhóm trang có Header & Footer */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />

            {['/about-us', '/about', '/gioi-thieu', '/contact', '/lien-he'].map(path => (
              <Route key={path} path={path} element={<AboutUs />} />
            ))}

            <Route path="/policy" element={<Policy />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/products" element={<AliasRedirect to="/search" />} />
            <Route path="/promotions" element={<Navigate to="/search?onSale=true" replace />} />
            <Route path="/products/:handle" element={<ProductDetailWrapper />} />
            <Route path="/cart" element={<CartPage />} />

            {/* Trang tài khoản */}
            <Route path="/my-profile" element={<MyProfile />}>
              <Route index element={<AccountInfoTab />} />
              <Route path="orders" element={<OrderHistoryTab />} />
              <Route path="wishlist" element={<WishlistTab />} />
              <Route path="security" element={<SecurityTab />} />
            </Route>

            <Route
              path="/profile"
              element={<AliasRedirect to="/my-profile" />}
            />

            <Route
              path="/orders"
              element={<AliasRedirect to="/my-profile/orders" />}
            />
            <Route path="/review" element={<AliasRedirect to="/my-profile/orders" />} />

            {/* Trang yêu cầu trả hàng của khách hàng */}
            <Route path="/returns" element={<ReturnRequest />} />
            <Route path="/returns/new" element={<ReturnRequest />} />
            <Route path="/orders/:orderId/return" element={<ReturnRequest />} />
            <Route path="/orders/:orderId/return/new" element={<ReturnRequest />} />
            <Route path="/orders/:orderId/returns" element={<ReturnRequest />} />
            <Route path="/orders/:orderId/returns/new" element={<ReturnRequest />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Nhóm trang Auth độc lập */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </Suspense></RouteErrorBoundary>

      <StoreChat />
      <AppNotifications />
    </BrowserRouter>
  );
}

export default App;
