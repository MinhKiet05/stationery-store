# StationeryStore

React/TypeScript storefront and admin dashboard with a Spring Boot backend.

Frontend environment example: [frontend/.env.example](frontend/.env.example).
Backend settings load automatically from the gitignored backend/.env file when starting from the repository root or backend/. Set DATABASE_URL (a JDBC PostgreSQL URL), DB_USERNAME, DB_PASSWORD and JWT_SECRET_BASE64 using KEY=value syntax without quotes or shell export. Environment variables override the file. Keep credentials outside Git. Set AI_ENABLED=false until Gemini is configured. Gemini, Cloudinary and Redis are optional; local business API tests use H2 without those services.

For frontend development, run `npm ci` then `npm run dev` in frontend/. Leave VITE_API_BASE_URL empty to use the local /api proxy; DEV_API_PROXY_TARGET defaults to http://localhost:10000. A production build requires VITE_API_BASE_URL to be a public HTTPS backend origin without /api.

For local browser writes, set backend FRONTEND_URL to the exact Vite origin you use (for example http://localhost:5173). The backend CORS allowlist distinguishes localhost from 127.0.0.1.

Verification from PowerShell:

```powershell
cd frontend
npm run lint
npm run build # requires the production origin described above
node --test --test-concurrency=1 tests/*.test.mjs
npm run test:audit
npm run test:cart
cd ../backend
.\mvnw.cmd test
```

Browser scripts use an installed Chrome/Edge/Chromium; set CHROME_PATH if autodetection cannot find it. Most browser scripts mock API responses. The opt-in real browser integration test starts Spring Boot with an isolated H2 database, seeds synthetic users/products/orders and starts Vite on port 5199:

```powershell
# From backend/; requires frontend dependencies and Node 22+.
$env:RUN_BROWSER_E2E = 'true'
.\mvnw.cmd '-Dtest=FullstackBrowserIntegrationTest' test
Remove-Item Env:RUN_BROWSER_E2E
```

See [the full-stack audit report](docs/FULLSTACK_AUDIT_REPORT.md) for findings, validation evidence, unresolved risks and deployment checks. Redis setup is documented in [docs/redis-integration.md](docs/redis-integration.md). AI configuration uses backend environment settings; reindexing is an explicit administrative operation and is not part of the audit tests.
