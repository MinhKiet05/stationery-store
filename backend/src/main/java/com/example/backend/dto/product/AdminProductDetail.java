package com.example.backend.dto.product;
import com.example.backend.dto.productvariant.ProductVariantResponse;
import java.util.List;
public record AdminProductDetail(ProductResponse product,List<Lookup> tags,List<ProductVariantResponse> variants,String stateToken,int lowStockThreshold) {
    public record Lookup(Long id,String name,Boolean active) {}
    public record Options(List<Lookup> categories,List<Lookup> vendors,List<Lookup> tags) {}
    public record Statistics(long totalProducts,long sellingProducts,long hiddenProducts,long lowStockProducts,int lowStockThreshold) {}
    public record Write(ProductRequest product,String expectedState) {}
    public record Status(Boolean available,String expectedState) {}
    public record VariantWrite(com.example.backend.dto.productvariant.ProductVariantRequest variant,Long expectedVersion,java.math.BigDecimal initialStock) {}
}
