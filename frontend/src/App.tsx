import Header from "./components/header/Header";
import Footer from "./components/footer/Footer";
import HomePage from "./pages/homePage/HomePage";
import ProductDetail from "./pages/productDetail/ProductDetail";
import Login from "./pages/login/Login";
import AiChatWidget from "./components/aiChat/AiChatWidget";
import AboutUs from "./pages/aboutUs/AboutUs";
function App() {
  const productMatch = window.location.pathname.match(/^\/products\/([^/]+)\/?$/);
  const isAboutUsPage = /^\/(about-us)\/?$/.test(window.location.pathname);
  return (
    <>
      <Header cartCount={3} />
      {/* Nội dung trang */}
      {isAboutUsPage ? <AboutUs /> : productMatch ? <ProductDetail handle={decodeURIComponent(productMatch[1])} />
        : window.location.pathname === "/login" ? <Login /> : <HomePage />}
      <Footer/>
      <AiChatWidget />
    </>
  );
}

export default App;
