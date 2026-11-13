package com.example.backend.repositories;

import com.example.backend.model.Vendor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface VendorRepository extends JpaRepository<Vendor, Long> {
    Optional<Vendor> findByName(String name);
    boolean existsByName(String name);
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndVendorIDNot(String name, Long vendorID);

    @Query("select count(p) from Product p where p.vendor.vendorID = :vendorID")
    long countProductsByVendorID(@Param("vendorID") Long vendorID);
}
