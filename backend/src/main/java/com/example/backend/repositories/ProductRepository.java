package com.example.backend.repositories;

import com.example.backend.model.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {
    Optional<Product> findByHandle(String handle);
    Optional<Product> findByHandleAndIsActiveTrue(String handle);
    boolean existsByHandle(String handle);
    boolean existsByTitleIgnoreCase(String title);
    boolean existsByTitleIgnoreCaseAndProductIDNot(String title, Long productID);
    boolean existsByHandleAndProductIDNot(String handle, Long productID);
    Page<Product> findByIsActiveTrue(Pageable pageable);
    Page<Product> findByTitleContainingIgnoreCaseAndIsActiveTrue(String title, Pageable pageable);
    Page<Product> findByProductType_ProductTypeIDAndIsActiveTrue(Long productTypeID, Pageable pageable);
    Page<Product> findByVendor_VendorIDAndIsActiveTrue(Long vendorID, Pageable pageable);
}
