# Gemini migration and deployment

> Historical guide for the earlier Gemini-only migration. The main database has since been
> migrated in code to PostgreSQL. Use [production-readiness.md](production-readiness.md)
> and [data-migration.md](data-migration.md) for current environment, schema and deployment steps.

## Files changed by this migration

- `.env.example` (new environment template)
- `README.md` (setup links)
- `backend/pom.xml` (official Gemini chat/embedding model libraries)
- `backend/src/main/resources/application.properties` (Gemini variables and fresh vector table)
- `backend/src/main/java/com/example/backend/ai/AiProperties.java` (Gemini settings, secret-safe string output)
- `backend/src/main/java/com/example/backend/ai/AiFailure.java` (provider error classification)
- `backend/src/main/java/com/example/backend/ai/OllamaCatalogAi.java` renamed/refactored to
  `backend/src/main/java/com/example/backend/ai/GeminiCatalogAi.java`
- `backend/src/main/java/com/example/backend/controller/AiController.java` (error text)
- `backend/src/main/java/com/example/backend/services/impl/ShoppingChatServiceImpl.java` (error text)
- `backend/src/test/java/com/example/backend/ai/GeminiCatalogAiTest.java` (new)
- `backend/src/test/java/com/example/backend/ai/GeminiModelsTest.java` (new)
- `backend/src/test/java/com/example/backend/ai/GeminiFailureTest.java` (new)
- `backend/src/test/java/com/example/backend/ai/GeminiFallbackTest.java` (new)
- `backend/src/test/java/com/example/backend/ai/GeminiDisabledTest.java` (new)
- `backend/docs/gemini-migration.md` (this guide)

## Architecture

The backend remains on Java 21, Spring Boot 4.1.1 and Spring AI 2.0.2. The official
`spring-ai-google-genai` and `spring-ai-google-genai-embedding` libraries replace
Ollama. Model libraries rather than starters preserve the existing lazy client
initialization: `AI_ENABLED=false` requires no key, Google credentials or vector
connection, including with the `ai` profile. Exactly one `CatalogAi` bean,
`GeminiCatalogAi`, implements the unchanged interface.

SQL Server still owns JPA and business/tracking data; a separate PostgreSQL Hikari
pool serves `PgVectorStore`. The frontend, DTOs, routes, weights/decay/history/cooldown,
recommendation scoring and stock/budget checks are unchanged. Tracking events do
not call Gemini. Controller/service edits only update provider names in error text.

Chat uses `gemini-2.5-flash-lite`, temperature zero, 160 output tokens, thinking
disabled and a JSON response schema for `{"productIDs":[1,2,3]}`. Server validation
independently enforces candidate membership, deduplication and a three-product cap.
Only SQL DTOs supply customer-facing facts. Invalid/trailing JSON and provider
failures retain catalog fallback.

Embeddings use `gemini-embedding-001` and the same model/options for documents and
queries. Initialization probes actual output length, compares it with configured
dimensions, then checks an existing table's dimensions and `embeddingModel` metadata
**before** schema initialization. Missing model metadata is incompatible. The old
default table `stationery_vectors` is explicitly rejected. SHA-256 fingerprints,
stable UUIDs, product ID metadata, deletions, scores and concurrency controls remain.

Spring AI and Google SDK retries are disabled (one attempt per call). Chat uses
`AI_TIMEOUT`; embedding HTTP and vector database operations use `AI_VECTOR_TIMEOUT`.
Stable `AiFailure` reasons include `RATE_LIMIT` (429/quota), `AUTHENTICATION`
(401/403), `NETWORK`, `TIMEOUT`, `VECTOR`, `MODEL_OUTPUT` and existing stage codes.
Initialization retains its 30-second backoff. The scheduler can retry an incomplete
index on its next run; there is no unbounded request-level quota retry loop.

## Local environment and key

Copy the root `.env.example` into an untracked `.env` and fill in secrets. Pass the
values to the backend via IDE environment settings or your shell. Spring Boot does
**not** automatically load `.env`; Docker Compose reads it for the local database.

```dotenv
SPRING_PROFILES_ACTIVE=ai
AI_ENABLED=true
GEMINI_API_KEY=<your private Gemini API key>
GEMINI_CHAT_MODEL=gemini-2.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=3072
PGVECTOR_URL=jdbc:postgresql://localhost:5433/stationery_ai
PGVECTOR_USERNAME=stationery_ai
PGVECTOR_PASSWORD=<your local PostgreSQL password>
PGVECTOR_TABLE=stationery_vectors_gemini
AI_TIMEOUT=30s
AI_VECTOR_TIMEOUT=5s
```

Models, dimensions, table and timeouts above have matching defaults. Supply a key
and usable vector connection/credentials to enable Gemini. The `ai` profile retains
its debug logging purpose; `AI_ENABLED` controls AI availability. Setting it to
`false` preserves catalog fallback and business features without AI connections.

The example includes all preserved tracking settings:

```dotenv
AI_VIEW_WEIGHT=1
AI_CART_WEIGHT=3
AI_PURCHASE_WEIGHT=5
AI_HALF_LIFE_DAYS=30
AI_HISTORY_DAYS=180
TRACKING_VIEW_COOLDOWN_SECONDS=300
AI_CHAT_REQUESTS_PER_MINUTE=10
AI_INDEX_DELAY_MS=60000
```

Keep existing `SQLSERVER_URL`, `SQLSERVER_USERNAME`, `SQLSERVER_PASSWORD`,
`JWT_SECRET_BASE64`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`,
`SMTP_FROM` and `FRONTEND_RESET_PASSWORD_URL`. SQL Server schema, JWT, SMTP and CORS
settings are unchanged.

Create/view a key in [Google AI Studio](https://aistudio.google.com/apikey) using a
project with quota/access for both models. Set the backend's `GEMINI_API_KEY` only;
never a frontend `VITE_` variable. Keep it out of source control and logs. No Vertex
AI service account is required: clients explicitly use the Gemini Developer API.

From the repository root, start local vectors with `docker compose up -d pgvector`.
From `backend`, start the application with `./mvnw spring-boot:run` (PowerShell:
`.\mvnw.cmd spring-boot:run`) with the environment supplied.

## Render and Supabase

Add the same AI/tracking values to the Render backend service's Environment settings.
Keep SQL Server/JWT/SMTP/frontend variables. Store the Gemini key and PostgreSQL
password as private values. Replace vector connection settings with those from the
Supabase project's Connect dialog converted to JDBC format. For a session pooler:

```dotenv
PGVECTOR_URL=jdbc:postgresql://<session-pooler-host>:5432/postgres?sslmode=require&currentSchema=public,extensions
PGVECTOR_USERNAME=postgres.<project-ref>
PGVECTOR_PASSWORD=<Supabase database password>
PGVECTOR_TABLE=stationery_vectors_gemini
```

Use the actual host, port, database and username from Supabase. A direct connection
is also suitable if the Render service can reach its network address. Use a direct
or **session** pooler for the long-lived Hikari pool; transaction pooling is not the
target for the existing session-level statement timeout/JDBC configuration.
`currentSchema=public,extensions` exposes extensions in Supabase's `extensions`
schema while the vector table stays in `public`. Keep passwords out of JDBC URLs.

Build with Java 21 and `./mvnw -DskipTests package`. Launch as in your current Render
deployment, binding to its assigned port if needed, for example on Linux:
`java -jar target/backend-0.0.1-SNAPSHOT.jar --server.port=$PORT`.
This migration does not deploy a service or modify a live database.

## Initialize and reindex

1. Choose a **new, unused** `PGVECTOR_TABLE`, such as `stationery_vectors_gemini`.
   Remove old deployment overrides. Keep the Ollama table and all its data/indexes.
   No copy, drop, truncate or alter is needed.
2. Ensure PostgreSQL has the `vector`, `hstore` and `uuid-ossp` extensions required
   by `PgVectorStore`. Enable missing extensions as an administrator through the
   Supabase dashboard/SQL editor if needed; leave existing extensions in their
   current schema. The application role needs schema usage and permission to
   create/use the new table and its indexes.
3. Configure the key, models and dimensions and enable AI. The first vector
   operation validates the embedding output, then creates the new table through
   the existing `initializeSchema(true)` path. Disabled AI performs no initialization.
4. The existing scheduler starts after about 15 seconds and syncs every
   `AI_INDEX_DELAY_MS` (60 seconds). To trigger it manually, send
   `POST /api/admin/ai/index` with an existing **ADMIN** bearer token. The response
   remains `{scanned, changed, status}`. Wait for `COMPLETED`; `RUNNING` means
   another index run holds the lock. A provider/DB failure retains the existing
   503 response. A later run skips successfully indexed, unchanged fingerprints.
5. Inspect the new table:

   ```sql
   select count(*) from public.stationery_vectors_gemini;
   select distinct metadata->>'embeddingModel', vector_dims(embedding)
   from public.stationery_vectors_gemini;
   ```

   Expect `gemini-embedding-001` and `3072` by default. Check semantic search,
   shopping chat, recommendations and AI-disabled fallback in the deployment.
   If quota is exhausted, wait for quota availability or adjust project quota/billing
   before retrying indexing.

Changing embedding model or dimensions later requires another fresh table and full
reindex. Never reuse Ollama embeddings. Default 3,072-dimensional vectors exceed
pgvector's 2,000-dimension HNSW `vector` limit, so the code selects exact cosine
search (`PgIndexType.NONE`), which can be slower for large catalogs. Optional
`GEMINI_EMBEDDING_DIMENSIONS=1536` selects HNSW but requires a fresh table/reindex.

## Validation and compatibility

Verified on 2026-11-18 using the Windows Maven wrapper and Java 21:

- `mvnw.cmd test`: **57 tests passed**, zero failures/errors/skips.
- `mvnw.cmd -DskipTests package`: **BUILD SUCCESS**; executable JAR at
  `backend/target/backend-0.0.1-SNAPSHOT.jar`.

The local verification supplied `-Dmaven.repo.local=C:\Users\ASUS\.m2\repository`
to use the workstation's existing Maven cache; this is not an application setting.

Tests mock external Gemini calls and need no real key or PostgreSQL. They cover
real Spring AI adapters at the mocked Google SDK boundary, JSON/ID validation,
indexing/fingerprints/deletion, dimension/model guards, rate limits/errors, catalog
fallback and full AI-disabled startup. The latter uses H2 for the business datasource.

Run from `backend`:

```sh
./mvnw test
./mvnw -DskipTests package
```

Windows uses `.\mvnw.cmd`. Live model availability, quota, Supabase extension
permissions, SSL/network reachability and deployed databases remain deployment
checks; mocked tests do not validate them.

Spring AI 2.0.2's embedding adapter forwards model and dimensions but does not
forward its optional task-type/title/auto-truncate options to the SDK. This migration
uses the same default embedding configuration for indexing and querying and does
not rely on those options. Any existing builder deprecation warnings do not require
a Spring Boot/Spring AI upgrade for this migration.

Official references checked:

- [Spring AI 2.0.2 Google GenAI chat](https://docs.spring.io/spring-ai/reference/api/chat/google-genai-chat.html)
- [Spring AI embeddings/manual configuration](https://docs.spring.io/spring-ai/reference/api/embeddings/google-genai-embeddings-text.html)
- [Google embedding dimensions](https://ai.google.dev/gemini-api/docs/embeddings)
- [pgvector dimension limits](https://github.com/pgvector/pgvector#hnsw)
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Gemini API key setup](https://ai.google.dev/gemini-api/docs/api-key)
