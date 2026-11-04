import Header from "./components/header/Header";
import Footer from "./components/footer/Footer";
import HomePage from "./pages/homePage/HomePage";
function App() {
  return (
    <>
      <Header cartCount={3} />
      {/* Nội dung trang */}
      <HomePage />
      <Footer/>
    </>
  );
}

export default App;