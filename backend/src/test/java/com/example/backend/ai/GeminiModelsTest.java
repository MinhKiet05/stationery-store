package com.example.backend.ai;

import com.google.genai.Client;
import com.google.genai.Models;
import com.google.genai.errors.ApiException;
import com.google.genai.types.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.document.Document;
import org.springframework.ai.google.genai.GoogleGenAiChatModel;
import java.time.Duration;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Uses real Spring AI adapters with the Google SDK network boundary mocked. */
class GeminiModelsTest {
    @Test
    void indexesAndQueriesWithTheSameGeminiModelAndDimensions() {
        try (var sdk = mockConstruction(Models.class);
             var client = Client.builder().vertexAI(false).apiKey("unit-test-placeholder")
                     .httpOptions(GeminiCatalogAi.httpOptions(Duration.ofSeconds(5))).build()) {
            when(client.models.embedContent(anyString(), anyList(), any(EmbedContentConfig.class)))
                    .thenReturn(EmbedContentResponse.builder().embeddings(ContentEmbedding.builder()
                            .values(Collections.nCopies(3072, 0.1f)).build()).build());
            var model = new GeminiCatalogAi(new AiProperties()).embeddingModel(client);
            assertThat(model.embed(new Document("Bút bi"))).hasSize(3072);
            assertThat(model.embed("Tìm bút bi")).hasSize(3072);
            var config = ArgumentCaptor.forClass(EmbedContentConfig.class);
            verify(client.models, times(2)).embedContent(eq("gemini-embedding-001"), anyList(), config.capture());
            assertThat(config.getAllValues()).allSatisfy(c -> assertThat(c.outputDimensionality()).contains(3072));
        }
    }

    @Test
    void actualChatAdapterSendsStructuredJsonOptions() {
        try (var sdk = mockConstruction(Models.class);
             var client = Client.builder().vertexAI(false).apiKey("unit-test-placeholder").build()) {
            when(client.models.generateContent(anyString(), anyList(), any(GenerateContentConfig.class)))
                    .thenReturn(GenerateContentResponse.builder().modelVersion("gemini-2.5-flash-lite").candidates(Candidate.builder().index(0)
                            .finishReason("STOP").content(Content.builder().role("model")
                                    .parts(Part.fromText("{\"productIDs\":[1]}")).build()).build()).build());
            var model = GoogleGenAiChatModel.builder().genAiClient(client)
                    .options(GeminiCatalogAi.chatOptions("gemini-2.5-flash-lite"))
                    .retryTemplate(GeminiCatalogAi.noRetries()).build();
            assertThat(model.call(new Prompt("Choose product 1")).getResult().getOutput().getText())
                    .isEqualTo("{\"productIDs\":[1]}");
            var config = ArgumentCaptor.forClass(GenerateContentConfig.class);
            verify(client.models).generateContent(eq("gemini-2.5-flash-lite"), anyList(), config.capture());
            assertThat(config.getValue().responseMimeType()).contains("application/json");
            assertThat(config.getValue().responseJsonSchema()).isPresent();
            assertThat(config.getValue().maxOutputTokens()).contains(160);
            assertThat(config.getValue().thinkingConfig().orElseThrow().thinkingBudget()).contains(0);
        }
    }

    @Test
    void actualAdaptersDoNotRetryQuotaErrors() {
        try (var sdk = mockConstruction(Models.class);
             var client = Client.builder().vertexAI(false).apiKey("unit-test-placeholder").build()) {
            var quota = new ApiException(429, "RESOURCE_EXHAUSTED", "quota");
            when(client.models.embedContent(anyString(), anyList(), any(EmbedContentConfig.class))).thenThrow(quota);
            when(client.models.generateContent(anyString(), anyList(), any(GenerateContentConfig.class))).thenThrow(quota);
            var embedding = new GeminiCatalogAi(new AiProperties()).embeddingModel(client);
            var chat = GoogleGenAiChatModel.builder().genAiClient(client)
                    .options(GeminiCatalogAi.chatOptions("gemini-2.5-flash-lite"))
                    .retryTemplate(GeminiCatalogAi.noRetries()).build();
            assertThatThrownBy(() -> embedding.embed("Bút bi"))
                    .satisfies(e -> assertThat(AiFailure.at(AiFailure.Reason.EMBEDDING, (RuntimeException) e).reason())
                            .isEqualTo(AiFailure.Reason.RATE_LIMIT));
            assertThatThrownBy(() -> chat.call(new Prompt("Choose product 1")))
                    .satisfies(e -> assertThat(AiFailure.at(AiFailure.Reason.CHAT, (RuntimeException) e).reason())
                            .isEqualTo(AiFailure.Reason.RATE_LIMIT));
            verify(client.models, times(1)).embedContent(anyString(), anyList(), any(EmbedContentConfig.class));
            verify(client.models, times(1)).generateContent(anyString(), anyList(), any(GenerateContentConfig.class));
        }
    }

    @Test
    void sdkTimeoutsAreBoundedAndIndexesRespectPgvectorLimits() {
        var embedding = GeminiCatalogAi.httpOptions(Duration.ofSeconds(5));
        var chat = GeminiCatalogAi.httpOptions(Duration.ofSeconds(30));
        assertThat(embedding.timeout()).contains(5000);
        assertThat(chat.timeout()).contains(30000);
        assertThat(chat.retryOptions().orElseThrow().attempts()).contains(1);
        assertThat(GeminiCatalogAi.indexType(3072)).isEqualTo(org.springframework.ai.vectorstore.pgvector.PgVectorStore.PgIndexType.NONE);
        assertThat(GeminiCatalogAi.indexType(2000)).isEqualTo(org.springframework.ai.vectorstore.pgvector.PgVectorStore.PgIndexType.HNSW);
    }
}
