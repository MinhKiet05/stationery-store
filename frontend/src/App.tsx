import { BrowserRouter, Routes, Route, useParams, useLocation, Navigate, Outlet } from "react-router-dom";
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
        {/* Nhóm trang có Header & Footer */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/policy" element={<Policy />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/products" element={<ProductSearchRedirect />} />
          <Route path="/products/:handle" element={<ProductDetailWrapper />} />
        </Route>

        {/* Nhóm trang Auth độc lập */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPasswordRedirect />} />
      </Routes>

      <AiChatWidget />
    </BrowserRouter>
  );
}

export default App;
