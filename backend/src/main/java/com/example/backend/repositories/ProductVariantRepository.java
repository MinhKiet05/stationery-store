package com.example.backend.repositories;

import com.example.backend.model.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {
    @org.springframework.data.jpa.repository.Query(RESPONSE_SELECT + """
         where v.product.isActive = true and v.stockQuantity < 10
         order by v.stockQuantity asc, v.variantID asc
         """)
    org.springframework.data.domain.Page<com.example.backend.dto.productvariant.ProductVariantResponse> findLowStock(
            org.springframework.data.domain.Pageable pageable);

    String RESPONSE_SELECT = """
        select new com.example.backend.dto.productvariant.ProductVariantResponse(
            v.variantID, v.product.productID, v.product.title, v.title, v.sku, v.available,
            v.price, v.compareAtPrice, v.option1, v.option2, v.option3, v.stockQuantity, v.version)
        from ProductVariant v
        """;
    @org.springframework.data.jpa.repository.Query(RESPONSE_SELECT)
    List<com.example.backend.dto.productvariant.ProductVariantResponse> findAllResponses();
    @org.springframework.data.jpa.repository.Query(RESPONSE_SELECT + " where v.product.productID = :productID")
    List<com.example.backend.dto.productvariant.ProductVariantResponse> findResponsesByProductID(
            @org.springframework.data.repository.query.Param("productID") Long productID);
    Optional<ProductVariant> findBySku(String sku);
    boolean existsBySku(String sku);
    List<ProductVariant> findByProduct_ProductID(Long productID);
    List<ProductVariant> findByProduct_ProductIDAndAvailableTrue(Long productID);
    // Optional for checkout: lock this row inside a @Transactional service method.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ProductVariant> findWithLockByVariantID(Long variantID);
}
