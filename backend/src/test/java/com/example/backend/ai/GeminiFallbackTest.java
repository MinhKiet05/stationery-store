package com.example.backend.ai;

import com.example.backend.services.impl.ShoppingChatServiceImpl;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GeminiFallbackTest {
    @ParameterizedTest
    @EnumSource(value = AiFailure.Reason.class, names = {"RATE_LIMIT", "AUTHENTICATION", "NETWORK", "TIMEOUT", "MODEL_OUTPUT", "DISABLED", "VECTOR"})
    void providerFailuresKeepSqlCatalogFallbackAndPrices(AiFailure.Reason reason) {
        var ai = mock(CatalogAi.class);
        var catalog = mock(ProductCatalog.class);
        var product = GeminiCatalogAiTest.product(1, true);
        when(ai.search(anyString(), anyInt())).thenReturn(Map.of(1L, 0.9));
        when(catalog.byIds(anyCollection())).thenReturn(List.of(product));
        when(catalog.keywordCandidates(any())).thenReturn(List.of(product));
        when(ai.select(anyString(), anyList())).thenThrow(new AiFailure(reason));
        var response = new ShoppingChatServiceImpl(catalog, ai).chat("bút bi");
        assertThat(response.source()).isEqualTo("CATALOG_FALLBACK");
        assertThat(response.products()).containsExactly(product.product());
    }

    @ParameterizedTest
    @EnumSource(value = AiFailure.Reason.class, names = {"RATE_LIMIT", "AUTHENTICATION", "NETWORK", "TIMEOUT", "DISABLED", "VECTOR"})
    void retrievalFailuresUseKeywordsWithoutAnExtraChatCall(AiFailure.Reason reason) {
        var ai = mock(CatalogAi.class);
        var catalog = mock(ProductCatalog.class);
        var product = GeminiCatalogAiTest.product(1, true);
        when(ai.search(anyString(), anyInt())).thenThrow(new AiFailure(reason));
        when(catalog.byIds(anyCollection())).thenAnswer(call -> ((java.util.Collection<?>) call.getArgument(0)).isEmpty()
                ? List.of() : List.of(product));
        when(catalog.keywordCandidates(any())).thenReturn(List.of(product));
        var response = new ShoppingChatServiceImpl(catalog, ai).chat("bút bi");
        assertThat(response.source()).isEqualTo("CATALOG_FALLBACK");
        assertThat(response.products()).containsExactly(product.product());
        verify(ai, never()).select(anyString(), anyList());
    }
}
