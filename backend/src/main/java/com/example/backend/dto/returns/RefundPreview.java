package com.example.backend.dto.returns;

import java.math.BigDecimal;
import java.util.List;

/** Merchandise estimate only. Shipping/collection and actual settlement remain separate. */
public record RefundPreview(List<Item> items, BigDecimal grossAmount, BigDecimal discountAmount,
        BigDecimal netAmount, boolean paymentConfirmed, BigDecimal shippingRefund,
        BigDecimal collectionFee, BigDecimal finalRefund) {
    public record Item(Long orderDetailID, int quantity, BigDecimal unitPrice,
            BigDecimal grossAmount, BigDecimal discountAmount, BigDecimal netAmount) {}
}
