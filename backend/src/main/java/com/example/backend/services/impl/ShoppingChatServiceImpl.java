package com.example.backend.services.impl;

import com.example.backend.ai.*;
import com.example.backend.dto.ai.ChatResponse;
import com.example.backend.services.ShoppingChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.*;

@Service @RequiredArgsConstructor @Slf4j
public class ShoppingChatServiceImpl implements ShoppingChatService {
    private final ProductCatalog catalog;
    private final CatalogAi ai;
    @Autowired(required = false)
    private RagSqlCounterConfiguration sqlCounter;
    @Override
    public ChatResponse chat(String message) {
        try (var trace = RagRequestTrace.open(sqlCounter != null && sqlCounter.isInstalled())) {
            var response = chat(message, trace);
            trace.completed(response.source());
            return response;
        }
    }

    private ChatResponse chat(String message, RagRequestTrace trace) {
        var query = ShoppingQuery.parse(message);
        var search = ShoppingSearch.from(message);
        log.debug("Shopping search parsed; databaseTerms={}", search.databaseTerms().size());
        Map<Long, Double> scores = Map.of();
        String fallbackReason = null;
        try {
            scores = trace.measure(RagRequestTrace.Stage.VECTOR_SEARCH, () -> ai.search(search.query(), 60));
            log.debug("Shopping vector count={} ids={}", scores.size(), scores.keySet());
        } catch (RuntimeException ex) {
            fallbackReason = failure(ex, "VECTOR");
            log.debug("Shopping retrieval unavailable reason={} exception={}", fallbackReason, ex.getClass().getSimpleName());
        }
        try {
            Map<Long, CatalogProduct> found = new LinkedHashMap<>();
            var vectorIds = scores.keySet();
            trace.measure(RagRequestTrace.Stage.CATALOG_VECTOR_IDS, () -> catalog.byIds(vectorIds))
                    .forEach(p -> found.put(p.product().productID(), p));
            var keywords = trace.measure(RagRequestTrace.Stage.KEYWORD_CANDIDATES, () -> catalog.keywordCandidates(search));
            keywords.forEach(p -> found.put(p.product().productID(), p));
            var semanticScores = scores;
            var selection = trace.measure(RagRequestTrace.Stage.FILTER_SORT,
                    () -> candidates(found, search, query, semanticScores));
            var brands = selection.brands();
            var relevant = selection.relevant();
            var candidates = selection.candidates();
            log.debug("Shopping SQL hydrated={} keyword={} relevant={} sellable={} eligible={} ids={}",
                    found.size(), keywords.size(), relevant.size(), relevant.stream().filter(CatalogProduct::sellable).count(),
                    candidates.size(), candidates.stream().map(p -> p.product().productID()).toList());
            if (candidates.isEmpty()) {
                if (fallbackReason != null) return unavailable(fallbackReason);
                String reason = relevant.isEmpty() ? "NO_RELEVANT_PRODUCT" : "NO_PURCHASABLE_VARIANT_WITHIN_BUDGET";
                log.debug("Shopping no candidates reason={}", reason);
                return new ChatResponse(relevant.isEmpty()
                        ? "Mình chưa tìm thấy sản phẩm phù hợp với nhu cầu này. Bạn thử từ khóa khác nhé."
                        : "Mình tìm thấy sản phẩm đúng từ khóa, nhưng hiện không có biến thể đang bán và còn hàng"
                        + (query.min() != null || query.max() != null ? " trong ngân sách của bạn." : "."), List.of(), "AI_RAG");
            }
            var allowed = new LinkedHashMap<Long, CatalogProduct>();
            candidates.forEach(p -> allowed.put(p.product().productID(), p));
            List<Long> selected = List.of();
            if (fallbackReason == null) {
                try {
                    var modelSelection = trace.measure(RagRequestTrace.Stage.GEMINI_SELECT, () -> ai.select(message, candidates));
                    selected = modelSelection.stream().distinct().filter(allowed::containsKey).limit(3).toList();
                    log.debug("Shopping model IDs={} accepted={}", modelSelection, selected);
                    if (selected.isEmpty()) fallbackReason = "MODEL_OUTPUT";
                } catch (RuntimeException ex) {
                    fallbackReason = failure(ex, "CHAT");
                    log.debug("Shopping selection unavailable reason={} exception={}", fallbackReason, ex.getClass().getSimpleName());
                }
            }
            if (selected.isEmpty()) selected = candidates.stream().limit(3).map(p -> p.product().productID()).toList();
            // Recheck stock and select a purchasable variant inside the actual budget after inference.
            var fresh = new HashMap<Long, CatalogProduct>();
            var selectedIds = selected;
            var rechecked = trace.measure(RagRequestTrace.Stage.CATALOG_SELECTED_IDS, () -> catalog.byIds(selectedIds));
            var products = trace.measure(RagRequestTrace.Stage.FINAL_FILTER, () -> {
                rechecked.stream()
                        .filter(p -> search.relevant(p, query, semanticScores.getOrDefault(p.product().productID(), 0.0)))
                        .filter(p -> brands.isEmpty() || brands.contains(p.product().vendorName()))
                        .forEach(p -> p.forBudget(query).ifPresent(valid -> fresh.put(valid.product().productID(), valid)));
                return selectedIds.stream().filter(fresh::containsKey).map(id -> fresh.get(id).product()).toList();
            });
            String source = fallbackReason == null ? "AI_RAG" : "CATALOG_FALLBACK";
            log.debug("Shopping result source={} fallbackReason={} ids={}", source, fallbackReason,
                    products.stream().map(p -> p.productID()).toList());
            return new ChatResponse(products.isEmpty() ? "Sản phẩm vừa thay đổi giá hoặc tình trạng còn hàng. Bạn thử tìm lại nhé."
                    : (fallbackReason == null ? "Mình tìm thấy " : "AI đang tạm bận. Mình tìm trong catalog và thấy ")
                    + products.size() + " sản phẩm phù hợp. Giá hiển thị thuộc biến thể còn hàng trong ngân sách của bạn.", products, source);
        } catch (RuntimeException ex) {
            log.debug("Shopping SQL verification unavailable reason=SQL exception={}", ex.getClass().getSimpleName());
            return new ChatResponse("Mình chưa thể kiểm tra dữ liệu sản phẩm lúc này. Bạn vui lòng thử lại sau nhé.", List.of(), "UNAVAILABLE");
        }
    }

    private record Candidates(Set<String> brands, List<CatalogProduct> relevant, List<CatalogProduct> candidates) {}

    private static Candidates candidates(Map<Long, CatalogProduct> found, ShoppingSearch search,
            ShoppingQuery query, Map<Long, Double> semanticScores) {
        var brands = found.values().stream().map(p -> p.product().vendorName()).filter(search::mentionsBrand)
                .collect(java.util.stream.Collectors.toSet());
        var relevant = found.values().stream()
                .filter(p -> search.relevant(p, query, semanticScores.getOrDefault(p.product().productID(), 0.0)))
                .filter(p -> brands.isEmpty() || brands.contains(p.product().vendorName())).toList();
        var candidates = relevant.stream().map(p -> p.forBudget(query)).flatMap(Optional::stream)
                .sorted(Comparator.comparingDouble((CatalogProduct p) -> 2 * search.lexicalScore(p)
                        + semanticScores.getOrDefault(p.product().productID(), 0.0)).reversed()
                        .thenComparing(p -> p.product().productID()))
                .limit(12).toList();
        return new Candidates(brands, relevant, candidates);
    }
    private static String failure(RuntimeException ex, String stage) {
        return AiFailure.at(stage.equals("VECTOR") ? AiFailure.Reason.VECTOR : AiFailure.Reason.CHAT, ex).reason().name();
    }
    private static ChatResponse unavailable(String reason) {
        String reply = switch (reason) {
            case "VECTOR" -> "Dịch vụ tìm kiếm AI đang mất kết nối. Mình chưa thể tìm đầy đủ sản phẩm; bạn thử lại sau nhé.";
            case "EMBEDDING", "CHAT" -> "Gemini hiện chưa phản hồi. Bạn vui lòng thử lại sau nhé.";
            case "TIMEOUT" -> "Tìm kiếm AI mất nhiều thời gian hơn dự kiến. Bạn thử lại sau nhé.";
            default -> "Trợ lý AI đang tạm bận. Bạn vui lòng thử lại sau nhé.";
        };
        return new ChatResponse(reply, List.of(), "UNAVAILABLE");
    }
}
