package com.example.backend.dto.order;
import java.math.BigDecimal;
public record OrderDetailResponse(Long orderDetailID, Long variantID, String variantTitle,
                                  Integer quantity, BigDecimal unitPrice, BigDecimal subTotal) {}
