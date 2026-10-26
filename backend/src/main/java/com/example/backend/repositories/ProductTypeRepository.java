package com.example.backend.repositories;

import com.example.backend.model.ProductType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ProductTypeRepository extends JpaRepository<ProductType, Long> {
    Optional<ProductType> findByName(String name);
    boolean existsByName(String name);
    List<ProductType> findByIsActiveTrue();
    Page<ProductType> findByNameContainingIgnoreCase(String name, Pageable pageable);
}
