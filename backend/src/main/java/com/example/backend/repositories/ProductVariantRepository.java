package com.example.backend.repositories;

import com.example.backend.model.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {
    Optional<ProductVariant> findBySku(String sku);
    boolean existsBySku(String sku);
    List<ProductVariant> findByProduct_ProductID(Long productID);
    List<ProductVariant> findByProduct_ProductIDAndAvailableTrue(Long productID);
    // Optional for checkout: lock this row inside a @Transactional service method.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ProductVariant> findWithLockByVariantID(Long variantID);
}
