package com.example.backend.dto.returns;

import java.time.LocalDateTime;
import java.util.List;

public record ReturnReceiptResponse(LocalDateTime receivedAt, String receivedBy, LocalDateTime inspectedAt,
        String inspectedBy, String inspectionNote, List<Item> items) {
    public record Item(Long returnItemID, Long variantID, Integer receivedQuantity, Integer goodQuantity,
            Integer damagedQuantity, Integer stockBefore, Integer stockAfter) {}
}
