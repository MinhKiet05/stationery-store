package com.example.backend.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.*;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.pgvector.PgVectorStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.util.*;
import org.springframework.ai.google.genai.text.GoogleGenAiTextEmbeddingModel;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Real pgvector storage with deterministic local embeddings; no Google API calls. */
@EnabledIfEnvironmentVariable(named = "TEST_POSTGRES_URL", matches = "jdbc:postgresql:.*")
class PgVectorPostgresTest {
    @BeforeAll
    static void prepareExtensions() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(System.getenv("TEST_POSTGRES_URL"), "postgres", ""));
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS extensions");
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions");
    }

    @Test
    void providerCreatesItsRealVectorPoolWithSessionSearchPathAndTimeoutWithoutGoogleCalls() {
        var properties = new AiProperties();
        properties.setEnabled(true);
        properties.setGeminiApiKey("unit-test-placeholder");
        properties.setVectorUrl(System.getenv("TEST_POSTGRES_URL"));
        properties.setVectorUsername("postgres");
        var ai = new GeminiCatalogAi(properties);
        float[] vector = new float[3072];
        vector[0] = 1;
        try (var models = mockConstruction(GoogleGenAiTextEmbeddingModel.class,
                (model, context) -> when(model.embed(anyString())).thenReturn(vector))) {
            assertThat(ai.search("pen", 1)).isEmpty();
            var jdbc = (JdbcTemplate) ReflectionTestUtils.getField(ai, "jdbc");
            assertThat(jdbc.queryForObject("select current_setting('statement_timeout')", String.class)).isEqualTo("5s");
            assertThat(jdbc.queryForObject("select current_setting('search_path')", String.class)).isEqualTo("public, extensions");
            assertThat(models.constructed()).hasSize(1);
        } finally { ai.close(); }
    }

    @Test
    void extensionsSchema3072DimensionsExactSearchAndMetadataSurviveReinitialization() throws Exception {
        var base = System.getenv("TEST_POSTGRES_URL");
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(base + (base.contains("?") ? "&" : "?")
                + "currentSchema=public,extensions", "postgres", ""));
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS extensions");
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions");
        var embeddings = new AbstractEmbeddingModel() {
            @Override public int dimensions() { return 3072; }
            @Override public float[] embed(Document document) { return embed(document.getText()); }
            @Override public EmbeddingResponse call(EmbeddingRequest request) {
                var results = new ArrayList<Embedding>();
                for (var text : request.getInstructions()) {
                    float[] vector = new float[3072];
                    vector[text.contains("pen") ? 0 : 1] = 1;
                    results.add(new Embedding(vector, results.size()));
                }
                return new EmbeddingResponse(results);
            }
        };
        var store = PgVectorStore.builder(jdbc, embeddings).dimensions(3072).vectorTableName("stationery_vectors_gemini")
                .indexType(GeminiCatalogAi.indexType(3072)).initializeSchema(true).build();
        store.afterPropertiesSet();
        String id = UUID.randomUUID().toString();
        store.add(List.of(new Document(id, "pen", Map.of("productID", 1L, "embeddingModel", "gemini-embedding-001", "contentHash", "test"))));
        GeminiCatalogAi.validateVectorSchema(jdbc, "stationery_vectors_gemini", "gemini-embedding-001", 3072);
        var result = store.similaritySearch(SearchRequest.builder().query("pen").topK(1).build());
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().getScore()).isCloseTo(1.0, within(0.0001));
        assertThat(GeminiCatalogAi.productId(result.getFirst().getMetadata().get("productID"))).isEqualTo(1L);
        store.afterPropertiesSet();
        assertThat(jdbc.queryForObject("select vector_dims(embedding) from public.stationery_vectors_gemini where id=?::uuid", Integer.class, id))
                .isEqualTo(3072);
        assertThatThrownBy(() -> GeminiCatalogAi.validateVectorSchema(jdbc, "stationery_vectors_gemini", "different-model", 3072))
                .hasMessageContaining("model mismatch");
        store.delete(List.of(id));
        assertThat(jdbc.queryForObject("select count(*) from public.stationery_vectors_gemini where id=?::uuid", Long.class, id)).isZero();
    }
}
