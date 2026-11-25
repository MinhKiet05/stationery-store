package com.example.backend.ai;

import com.example.backend.dto.product.ProductResponse;
import com.google.genai.errors.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.document.Document;
import org.springframework.ai.google.genai.text.GoogleGenAiTextEmbeddingModel;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.pgvector.PgVectorStore;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.Semaphore;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GeminiCatalogAiTest {
    private final AiProperties properties = new AiProperties();
    private final PgVectorStore vector = mock(PgVectorStore.class);
    private final ChatModel chat = mock(ChatModel.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private GeminiCatalogAi ai;

    @BeforeEach
    void initializedProvider() {
        properties.setEnabled(true);
        ai = new GeminiCatalogAi(properties);
        ReflectionTestUtils.setField(ai, "store", vector);
        ReflectionTestUtils.setField(ai, "chat", chat);
        ReflectionTestUtils.setField(ai, "jdbc", jdbc);
    }

    @Test
    void selectsOnlyCandidateIdsAndCapsAtThreeWithoutReturningModelProse() {
        when(chat.call(any(Prompt.class))).thenReturn(response("{\"productIDs\":[999,2,2,1,3,4]}"));
        var candidates = List.of(product(1, true), product(2, true), product(3, true), product(4, true));
        assertThat(ai.select("bút bi dưới 20k", candidates)).containsExactly(2L, 1L, 3L);
        var prompt = ArgumentCaptor.forClass(Prompt.class);
        verify(chat).call(prompt.capture());
        assertThat(prompt.getValue().getContents()).contains("catalog", "productID", "bút bi dưới 20k");
        verifyNoInteractions(vector, jdbc);
    }

    @Test
    void invalidModelResponseAllowsAnotherRequestAfterFailure() {
        when(chat.call(any(Prompt.class))).thenReturn(response("{\"productIDs\":[999]}"), response("{\"productIDs\":[1]}"));
        assertThatThrownBy(() -> ai.select("bút bi", List.of(product(1, true))))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.MODEL_OUTPUT));
        assertThat(ai.select("bút bi", List.of(product(1, true)))).containsExactly(1L);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "null", "[]", "{}", "not json", "```json\n{\"productIDs\":[1]}\n```",
            "{\"productIDs\":[999,-1,0,1.5,true,null,{},9223372036854775808]}",
            "{\"productIDs\":[]}", "{\"productIDs\":[1]} {}", "{\"productIDs\":1}"})
    void rejectsInvalidJsonAndUnusableIds(String output) {
        assertThatThrownBy(() -> GeminiCatalogAi.parseSelection(output, Set.of(1L)))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.MODEL_OUTPUT));
    }

    @Test
    void preservesSafeParsingOfLegacyStringIdsAndMetadataNumbers() {
        assertThat(GeminiCatalogAi.parseSelection("{\"productIDs\":[\"2\",1,2,999]}", Set.of(1L, 2L)))
                .containsExactly(2L, 1L);
        assertThat(GeminiCatalogAi.productId("1.0")).isEqualTo(1L);
        assertThat(GeminiCatalogAi.productId("1.5")).isNull();
        assertThat(GeminiCatalogAi.productId("9223372036854775808")).isNull();
    }

    @Test
    void skipsChatForEmptyCandidatesAndRejectsBusyRequests() throws Exception {
        assertThat(ai.select("bút bi", List.of())).isEmpty();
        var capacity = (Semaphore) ReflectionTestUtils.getField(ai, "capacity");
        capacity.acquire(2);
        assertThatThrownBy(() -> ai.search("bút bi", 3))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.BUSY));
        capacity.release(2);
        verifyNoInteractions(vector, chat, jdbc);
    }

    @Test
    void searchKeepsBestFiniteScoreAndValidProductMetadata() {
        when(vector.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(
                document(1L, 0.4), document("1.0", 0.8), document(2L, 0.3),
                document("invalid", 0.9), document(3L, Double.NaN)));
        assertThat(ai.search("bút bi", 100)).containsExactlyInAnyOrderEntriesOf(Map.of(1L, 0.8, 2L, 0.3));
        var request = ArgumentCaptor.forClass(SearchRequest.class);
        verify(vector).similaritySearch(request.capture());
        assertThat(request.getValue().getTopK()).isEqualTo(60);
        assertThat(request.getValue().getSimilarityThreshold()).isZero();
    }

    @Test
    void indexingKeepsDeterministicIdHashAndModelMetadata() throws Exception {
        var product = product(1, true);
        when(jdbc.queryForList(anyString(), eq(String.class), anyString())).thenReturn(List.of());
        assertThat(ai.synchronize(product)).isTrue();
        @SuppressWarnings("unchecked") ArgumentCaptor<List<Document>> documents = ArgumentCaptor.forClass(List.class);
        verify(vector).add(documents.capture());
        var doc = documents.getValue().getFirst();
        assertThat(doc.getId()).isEqualTo(vectorId(1));
        assertThat(doc.getText()).isEqualTo(product.semanticText());
        assertThat(doc.getMetadata()).containsEntry("productID", 1L)
                .containsEntry("embeddingModel", "gemini-embedding-001").containsEntry("contentHash", hash(product.semanticText()));
    }

    @Test
    void unchangedProductsDoNotGenerateDuplicateEmbeddings() throws Exception {
        var product = product(1, true);
        when(jdbc.queryForList(anyString(), eq(String.class), anyString())).thenReturn(List.of(hash(product.semanticText())));
        assertThat(ai.synchronize(product)).isFalse();
        verifyNoInteractions(vector, chat);
    }

    @Test
    void unavailableProductDeletesOnlyItsDocumentFromTheGeminiStore() {
        assertThat(ai.synchronize(product(1, false))).isTrue();
        verify(vector).delete(List.of(vectorId(1)));
        verifyNoMoreInteractions(vector);
        verifyNoInteractions(jdbc, chat);
    }

    @Test
    void rejectsDimensionMismatchBeforeOpeningDatabase() {
        properties.setGeminiApiKey("unit-test-placeholder");
        ai = new GeminiCatalogAi(properties);
        try (var embeddings = mockConstruction(GoogleGenAiTextEmbeddingModel.class,
                (model, context) -> when(model.embed(anyString())).thenReturn(new float[768]))) {
            assertThatThrownBy(() -> ai.search("bút bi", 3))
                    .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.CONFIGURATION));
            assertThat(embeddings.constructed()).hasSize(1);
            assertThat(ReflectionTestUtils.getField(ai, "pool")).isNull();
            // Failed initialization is backed off; no duplicate dimension probe.
            assertThatThrownBy(() -> ai.search("bút bi", 3)).isInstanceOf(AiFailure.class);
            verify(embeddings.constructed().getFirst()).embed(anyString());
        }
    }

    @Test
    void existingTableDimensionAndModelGuardsAreReadOnly() {
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), anyString())).thenReturn(true);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), anyString())).thenReturn(768);
        assertThatThrownBy(() -> GeminiCatalogAi.validateVectorSchema(jdbc, properties.getVectorTable(), properties.getEmbeddingModel(), 3072))
                .hasMessageContaining("dimension mismatch");
        when(jdbc.queryForObject(anyString(), eq(Integer.class), anyString())).thenReturn(3072);
        when(jdbc.queryForList(anyString(), eq(String.class))).thenReturn(Arrays.asList("old-model", null));
        assertThatThrownBy(() -> GeminiCatalogAi.validateVectorSchema(jdbc, properties.getVectorTable(), properties.getEmbeddingModel(), 3072))
                .hasMessageContaining("model mismatch");
        when(jdbc.queryForList(anyString(), eq(String.class))).thenReturn(List.of(properties.getEmbeddingModel()));
        assertThatCode(() -> GeminiCatalogAi.validateVectorSchema(jdbc, properties.getVectorTable(), properties.getEmbeddingModel(), 3072))
                .doesNotThrowAnyException();
        verify(jdbc, never()).execute(anyString());
        verify(jdbc, never()).update(anyString());
    }

    @Test
    void missingKeyAndLegacyTableAreRejectedLazily() {
        var fresh = new GeminiCatalogAi(properties);
        assertThatThrownBy(() -> fresh.search("bút bi", 3)).isInstanceOf(AiFailure.class);
        properties.setGeminiApiKey("unit-test-placeholder");
        properties.setVectorTable("stationery_vectors");
        assertThatThrownBy(() -> new GeminiCatalogAi(properties).search("bút bi", 3))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.CONFIGURATION));
    }

    @Test
    void rateLimitsNeverRetryChat() {
        when(chat.call(any(Prompt.class))).thenThrow(new ApiException(429, "RESOURCE_EXHAUSTED", "quota"));
        assertThatThrownBy(() -> ai.select("bút bi", List.of(product(1, true))))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.RATE_LIMIT));
        verify(chat, times(1)).call(any(Prompt.class));
    }

    @Test
    void vectorFailuresKeepTheirDiagnosticStage() {
        when(vector.similaritySearch(any(SearchRequest.class))).thenThrow(new DataAccessResourceFailureException("offline"));
        assertThatThrownBy(() -> ai.search("bút bi", 3))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.VECTOR));
        doThrow(new DataAccessResourceFailureException("offline")).when(vector).delete(anyList());
        assertThatThrownBy(() -> ai.synchronize(product(1, false)))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.VECTOR));
    }

    static CatalogProduct product(long id, boolean available) {
        return new CatalogProduct(new ProductResponse(id, "Bút bi " + id, "pen-" + id, "", BigDecimal.TEN,
                BigDecimal.TEN, BigDecimal.TEN, null, available, true, BigDecimal.ZERO, 0,
                null, null, null, "Bút bi", List.of()), "Bút bi " + id, Set.of(), available);
    }

    private static ChatResponse response(String text) { return new ChatResponse(List.of(new Generation(new AssistantMessage(text)))); }
    private static Document document(Object id, double score) {
        return Document.builder().text("pen").metadata(Map.of("productID", id)).score(score).build();
    }
    private static String vectorId(long id) {
        return UUID.nameUUIDFromBytes(("stationery-product-" + id).getBytes(StandardCharsets.UTF_8)).toString();
    }
    private static String hash(String text) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
    }
}
