package com.example.backend.ai;

import com.example.backend.services.impl.ShoppingChatServiceImpl;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RagBudgetPreservationTest {
    @ParameterizedTest
    @CsvSource({
            "bút bi dưới 30k,30000,true,-1",
            "bút bi tối đa 30k,30000,true,30000",
            "bút bi từ 30k đến 40k,20000;30000;40000,true,30000",
            "bút bi tối thiểu 30k,20000,true,-1",
            "bút bi từ 30k đến 40k,40000,true,40000",
            "bút bi dưới 30k,20000,false,-1"
    })
    void requestPipelineRetainsBudgetBoundariesAndSellingEligibility(String message, String prices,
            boolean sellable, int expectedPrice) {
        var base = GeminiCatalogAiTest.product(1, sellable);
        var offers = Arrays.stream(prices.split(";")).map(p -> new CatalogProduct.Offer(new BigDecimal(p), null)).toList();
        var product = new CatalogProduct(base.product(), base.semanticText(), base.tags(), sellable, offers);
        var ai = mock(CatalogAi.class);
        var catalog = mock(ProductCatalog.class);
        when(ai.search(anyString(), eq(60))).thenReturn(Map.of(1L, 0.9));
        when(catalog.byIds(anyCollection())).thenReturn(List.of(product));
        when(catalog.keywordCandidates(any())).thenReturn(List.of(product));
        when(ai.select(anyString(), anyList())).thenReturn(List.of(1L));
        var response = new ShoppingChatServiceImpl(catalog, ai).chat(message);
        assertThat(response.source()).isEqualTo("AI_RAG");
        if (expectedPrice < 0) {
            assertThat(response.products()).isEmpty();
            verify(ai, never()).select(anyString(), anyList());
        } else {
            assertThat(response.products()).hasSize(1);
            assertThat(response.products().getFirst().price()).isEqualByComparingTo(Integer.toString(expectedPrice));
        }
    }
}
