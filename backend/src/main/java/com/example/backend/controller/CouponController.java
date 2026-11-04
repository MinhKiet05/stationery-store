package com.example.backend.controller;

import com.example.backend.dto.coupon.*;
import com.example.backend.services.CouponService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.List;

/** HTTP adapter; administrative authorization is enforced by the service proxy. */
@RestController
@RequestMapping("/api/coupons")
@RequiredArgsConstructor
public class CouponController {
    private final CouponService service;

    @GetMapping
    public List<CouponResponse> coupons() {
        return service.getCoupons();
    }

    @GetMapping("/{id}")
    public CouponResponse coupon(@PathVariable Long id) {
        return service.getCoupon(id);
    }

    @PostMapping
    public ResponseEntity<CouponResponse> create(@Valid @RequestBody CouponRequest request) {
        CouponResponse response = service.create(request);
        return ResponseEntity.created(URI.create("/api/coupons/" + response.couponID())).body(response);
    }

    @PutMapping("/{id}")
    public CouponResponse update(@PathVariable Long id, @Valid @RequestBody CouponRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deactivate(@PathVariable Long id) {
        service.deactivate(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/validate")
    public CouponValidationResponse validate(@Valid @RequestBody ValidateCouponRequest request) {
        return service.validate(request);
    }
}
