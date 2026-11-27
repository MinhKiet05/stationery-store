package com.example.backend.dto.returns;

import com.example.backend.model.OrderStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** No refund amount is inferred from gross item prices or order totals. */
public record AdminReturnDetailResponse(AdminReturnRow request, OrderInfo order,
        List<Item> items, List<String> evidenceUrls, ReturnReceiptResponse receipt, RefundPreview pricing) {
    public record OrderInfo(LocalDateTime orderDate, OrderStatus status, Boolean isPaid, String paymentMethod,
            BigDecimal totalAmount, String contactPhone, String shippingAddress, LocalDateTime deliveredAt) {}
    public record Item(Long returnItemID, Long orderDetailID, Long variantID, String productTitle,
            String imageUrl, String sku, String variantTitle, Integer purchasedQuantity, Integer quantity, BigDecimal unitPrice,
            BigDecimal grossAmount, BigDecimal discountAmount, BigDecimal netAmount) {}
}
