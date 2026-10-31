package com.example.backend.services;

import com.example.backend.dto.coupon.*;
import java.util.List;

/** Administrative maintenance and authenticated, non-consuming coupon previews. */
public interface CouponService {
    List<CouponResponse> getCoupons();
    CouponResponse getCoupon(Long id);
    CouponResponse create(CouponRequest request);
    CouponResponse update(Long id, CouponRequest request);
    void deactivate(Long id);
    CouponValidationResponse validate(ValidateCouponRequest request);
}
