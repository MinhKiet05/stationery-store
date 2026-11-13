package com.example.backend.dto.returns;

public record ReturnItemResponse(Long returnItemID, Long orderDetailID, Long variantID, Integer quantity) {}
