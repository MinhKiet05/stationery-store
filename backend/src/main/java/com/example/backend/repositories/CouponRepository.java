package com.example.backend.repositories;

import com.example.backend.model.Coupon;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CouponRepository extends JpaRepository<Coupon, Long> {
    Optional<Coupon> findByCode(String code);
    boolean existsByCode(String code);
    List<Coupon> findByIsActiveTrue();
    Page<Coupon> findByCodeContainingIgnoreCase(String code, Pageable pageable);
    List<Coupon> findByIsActiveTrueAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
            LocalDate todayForStart, LocalDate todayForEnd);
}
