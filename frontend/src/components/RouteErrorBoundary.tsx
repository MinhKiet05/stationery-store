import { Component, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; chunk: boolean }> {
  state = { failed: false, chunk: false };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    return { failed: true, chunk: /dynamically imported module|module script|chunk|loading css/i.test(message) };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false, chunk: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="page-error" role="alert">
      <h1>{this.state.chunk ? 'Có phiên bản mới của cửa hàng' : 'Chưa thể hiển thị trang'}</h1>
      <p>{this.state.chunk ? 'Vui lòng tải lại để cập nhật và tiếp tục sử dụng.' : 'Đã xảy ra lỗi khi hiển thị nội dung. Bạn có thể thử tải lại trang.'}</p>
      <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
      <Link to="/">Về trang chủ</Link>
    </section>;
  }
}

export default function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
