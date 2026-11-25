package com.example.backend.dto.product;
public record AdminProductFilter(String search, Long productTypeID, Long vendorID, Status status, Boolean lowStock, Sort sort) {
    public enum Status { SELLING, HIDDEN, DELETED }
    public enum Sort { ID_DESC, ID_ASC }
}
