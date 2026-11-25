# Redis integration — verification 2026-11-24

## Configuration and environment

- Existing Lettuce shared native connection; no per-request pool. Two I/O threads, two computation threads; connect/command timeout 1 second, disconnected commands rejected, queue limited to 32.
- `REDIS_ENABLED=false` creates no Redis factory and uses SQL reset tokens/local bounded rate limits. Ordinary cache failures use PostgreSQL with a 5-second retry cooldown; security operations fail closed with 503.
- JSON allowlist for DTOs, aggregate records, collections, selected enums/dates; no Hibernate entities or Java object serialization. Null responses are not cached.
- Render variables: `REDIS_ENABLED`, `REDIS_HOST`, `REDIS_PORT=6379`, `REDIS_USERNAME=default`, `REDIS_PASSWORD`, `REDIS_SSL_ENABLED=false`, `CACHE_ENVIRONMENT=production`, and separate random `PASSWORD_RESET_HMAC_SECRET_BASE64` (at least 32 decoded bytes). Match port/TLS to the actual database; defaults do not imply Cloud TLS is disabled.
- Configure `TRUSTED_PROXY_CIDRS` with verified ingress addresses only. Forwarded headers are otherwise ignored (`server.forward-headers-strategy=NONE`). Never use a global CIDR or assume Render outbound ranges are ingress ranges.
- Rate variables/defaults: `LOGIN_MAX_FAILURES=5`, `LOGIN_IP_MAX_FAILURES=50`, `LOGIN_WINDOW_SECONDS=300`; `REGISTER_MAX_REQUESTS=5`, `REGISTER_WINDOW_SECONDS=900`; `FORGOT_MAX_REQUESTS=3`, `FORGOT_WINDOW_SECONDS=900`; `RESET_MAX_REQUESTS=30`, `RESET_WINDOW_SECONDS=60`; `OTP_RESEND_COOLDOWN_SECONDS=60`, `OTP_MAX_ATTEMPTS=5`; `AI_CHAT_REQUESTS_PER_MINUTE=10`.
- Prefixes: `stationery-store:<environment>:v1:ordinary:*` and separate `stationery-store:<environment>:security:*`. Spring Boot does not load `.env` automatically; supply variables in Render Environment. Existing Dockerfile builds Java 21 and needs no Redis container or schema migration.

## Cache names and TTL

Names below have prefix `ordinary:`.

| Cache | TTL |
| --- | --- |
| product-list | 180 seconds |
| product-detail, product-variants, popular-products | 300 seconds |
| categories, brands | 1,800 seconds |
| admin-overview, admin-orders, admin-returns, admin-inventory, admin-vouchers | 60 seconds |
| admin-revenue, admin-reviews, admin-users | 120 seconds |
| catalog-generation | 86,400 seconds |

Unspecified ordinary caches default to 300 seconds. Voucher **statistics** are cached; voucher lists and validation are not. Personal/admin detail lists are uncached. Popular products use the existing sellable-product fallback, not a new sales ranking.

Keys include method, normalized filters, paging/sort or resolved date range, plus ADMIN global scope for aggregates. Free-text and arbitrary price searches bypass caching. Fixed slots bound the existing data caches to 416 entries/environment, each at most 32 KiB serialized (13 MiB payload upper bound, **not measured Redis RAM**). Keys/metadata, security stores and other environments consume additional memory. Local striped locks coalesce misses within one application instance; no distributed stampede lock.

## Invalidation and correctness

- Service advice merges generation invalidation after successful database commit; rollback leaves generations unchanged. No `KEYS`/`FLUSHALL` or catalog-wide payload keys are used by application operations.
- Triggers: product/variant CRUD, prices, status, stock, Excel product import; category/brand changes; order placement/status/cancellation and coupon usage; return decisions/restocking; voucher CRUD/import; review and user changes/registration. Category/brand writes invalidate their own group, products and admin aggregates; other writes invalidate relevant product/admin groups.
- Checkout locks/reads SQL price and stock; voucher eligibility/usage and return amounts remain database decisions. ADMIN authorization runs before cache access; JWT roles are loaded from SQL on every authenticated request, not cached.
- TanStack invalidation and cart snapshot rollback/session guards reviewed. Fixed missing category/vendor mutation invalidation in `queryCache.js`, with regression coverage; no Query infrastructure redesign.
- Failed invalidations remain pending in the current instance and rotate generations before recovery hits. Pending state is not durable across restarts or shared between instances: stale ordinary data can remain until its TTL if the writer disappears during an outage. Checkout/security never rely on this data.

## Reset tokens and rate limits

The existing flow is a reset **link**, not a numeric OTP. Preserve its 15-minute lifetime: SecureRandom secret, purpose-separated HMAC, atomic Lua activation/consumption and old-link invalidation; five failed attempts block that challenge until expiry. Redis loss never switches an active challenge to SQL or accepts a token. Consumption precedes SQL password update; a later SQL failure requires a new link. Existing SQL table/data remain intact; switching stores or rotating the HMAC secret invalidates outstanding links.

Atomic Lua counters cover failed login (IP+username and broader IP cap), registration, forgot/resend, reset submissions and chatbot. Identifiers are hashed, not raw credentials/emails; exceeded limits return 429 with `Retry-After`, unavailable Redis returns 503. Local counters when Redis is disabled are process-local, not a distributed protection mechanism.

## Benchmark

No production requests or real email were used. Docker's Redis engine is unavailable on this machine; the loopback service is **fakeredis with Lua**, not Redis Server/Cloud. Java 21, MockMvc, H2 with 24 products/variants, one category/brand and 12 vouchers; financial tables empty. Same warmed context/data for all modes: three warm-up rounds, ten measured requests/mode/API, sequential with 100 ms pauses (234 total requests). Disabled means the ordinary-cache bypass flag in that context, not a second application startup; disabled boot wiring is separately unit-tested. ADMIN is a mock principal: SQL counts exclude the JWT converter's real database role lookup. Existing MVC DEBUG logging remains active. Compare latency as a local diagnostic only.

Times are **P50 / P95 in milliseconds**, nearest-rank; with ten samples P95 is the maximum, not a stable tail estimate.

| API | Cache bypass | Forced miss | Hit / repeated read | SQL per request: bypass/miss/hit |
| --- | --- | --- | --- | --- |
| Product list (10/page) | 20.270 / 42.481 | 23.448 / 45.232 | 16.891 / 22.970 | 3 / 3 / 0 |
| Product detail | 13.232 / 18.717 | 20.188 / 30.400 | 11.897 / 53.901 | 4 / 4 / 0 |
| Categories | 7.254 / 13.840 | 11.592 / 23.780 | 8.564 / 11.697 | 1 / 1 / 0 |
| Dashboard overview | 15.320 / 21.145 | 19.627 / 29.645 | 11.735 / 18.979 | 5 / 5 / 0 |
| Revenue (DAY, November 2026) | 10.174 / 12.754 | 16.003 / 17.440 | 10.265 / 12.665 | 1 / 1 / 0 |
| Voucher list (10/page, uncached) | 9.534 / 15.388 | 10.312 / 13.890 | 9.149 / 13.795 | 2 / 2 / 2 |

All five cacheable APIs had ten forced source loads and ten repeated reads with zero SQL; responses were identical in all modes. Voucher list had zero cache hits. No uniform latency improvement is established on H2/fakeredis. Existing read-query tests also passed their bounded SQL budgets: product pages of 1/5/20 used three statements; 40 products used four, consistent with batched image loading rather than one query per item.

After the five cacheable probes, `SCAN`/`STRLEN` found eight ordinary keys in the diagnostic namespace, 7,708 stored value bytes, largest value 5,507 bytes. These are encoded payload sizes, **not Redis memory usage**. The test double does not provide Redis `INFO` memory/connection/ops metrics; those three measurements and actual Redis Cloud hit/miss telemetry remain unmeasured.

## Tests

Backend `mvnw -o -q compile test` ran the full suite **once**, with loopback Redis test-double tests enabled: 333 tests, 305 passed, 27 skipped, one benchmark-fixture failure (ADMIN principal absent on later MockMvc requests). Fixed the fixture to attach ADMIN on every request; reran **only** `RedisPerformanceVerificationTest`: 1 passed, zero failures/errors (58.90 seconds). Thus all 306 executed test cases have passing results after that targeted correction; the full suite was not repeated. Skips require a separate PostgreSQL test database (readiness/query, vector/hydration, user-profile suites). Redis configuration/cache/invalidation/checkout/security tests all passed in the full run.

Frontend: all **17 `test:*` scripts passed**, including eight Query cache unit tests and browser tests for mutation refresh, authorization and cart rollback/session isolation. Production build attempted **once**: TypeScript passed, Vite config rejected missing `VITE_API_BASE_URL` before bundling. Existing required value is `https://stationery-store-ak08.onrender.com` (origin without `/api`); no source fix or repeated build was made for this environment issue. A successful production bundle remains unverified.

## Deployment checklist and unresolved verification

- Verify Redis Cloud **30 MB / 30 connections / 100 ops/s** against the intended plan. Require **noeviction** for the shared security/cache database: evicting a counter could reset a rate-limit window. When full, ordinary writes may fall back to SQL while security writes reject temporarily. Verify policy/persistence/access controls in the Cloud console; none were inspected here.
- Use one environment per small database where possible; payload bounds exclude security keys and Redis overhead. Monitor Cloud memory, connections and ops/s privately; two reads per ordinary hit already consume part of the 100 ops/s budget, before security Lua commands and other instances. A shared Lettuce connection is configuration intent, not a measured connection count.
- Set secrets/TLS/environment/proxy CIDRs on all instances consistently; do not toggle OTP stores automatically during an outage. Test healthy cache, outage SQL fallback, security 503, ADMIN 401/403 and reset single-use on staging with synthetic data.
- Only Actuator `health` is exposed, without components/details; Redis health is excluded from the website readiness check. No new monitoring endpoints or public metrics were enabled.
- Real Redis/PostgreSQL latency, memory usage, connections, ops/s, Render ingress configuration and production logs remain unverified. Local diagnostic success alone is not production capacity approval.
