package com.example.backend.repositories;

import com.example.backend.model.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface VendorRepository extends JpaRepository<Vendor, Long> {
    Optional<Vendor> findByName(String name);
    boolean existsByName(String name);
}
