package com.example.backend.dto.order;

import com.example.backend.model.ReturnStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record AdminOrderDetailResponse(OrderResponse order, String customerName, String username,
        String email, Map<Long, String> variantSkus, List<ReturnSummary> returns) {
    public record ReturnSummary(Long returnID, String reason, ReturnStatus status,
            LocalDateTime createdAt, LocalDateTime processedAt, String adminNote) {}
}
