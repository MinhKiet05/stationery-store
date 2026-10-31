package com.example.backend.services.impl;

import com.example.backend.dto.coupon.*;
import com.example.backend.model.Coupon;
import com.example.backend.model.DiscountType;
import com.example.backend.repositories.CouponRepository;
import com.example.backend.services.CouponService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * Coupon maintenance shares checkout's row lock to preserve concurrent
 * redemption counts.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CouponServiceImpl implements CouponService {
    private final CouponRepository coupons;
    private final EntityManager entityManager;

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public List<CouponResponse> getCoupons() {
        return coupons.findAll().stream().map(CouponResponse::from).toList();
    }

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public CouponResponse getCoupon(Long id) {
        return CouponResponse.from(requireCoupon(id));
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public CouponResponse create(CouponRequest request) {
        validateDefinition(request);
        Coupon coupon = new Coupon();
        apply(coupon, request);
        coupon.setUsedCount(0);
        return save(coupon);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public CouponResponse update(Long id, CouponRequest request) {
        validateDefinition(request);
        Coupon coupon = lockedCoupon(id);
        if (request.usageLimit() != null && request.usageLimit() < usedCount(coupon)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Gioi han nho hon so luot da dung");
        }
        // usedCount is intentionally not copied from the request or reset during
        // updates.
        apply(coupon, request);
        return save(coupon);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public void deactivate(Long id) {
        // Soft deletion preserves historical order references and serializes with
        // checkout.
        lockedCoupon(id).setIsActive(false);
    }

    @Override
    @PreAuthorize("isAuthenticated()")
    public CouponValidationResponse validate(ValidateCouponRequest request) {
        Coupon coupon = coupons.findByCode(request.code().trim().toUpperCase(Locale.ROOT))
                .orElseThrow(() -> bad("Ma giam gia khong hop le"));
        LocalDate today = LocalDate.now();
        if (!Boolean.TRUE.equals(coupon.getIsActive())
                || (coupon.getStartDate() != null && today.isBefore(coupon.getStartDate()))
                || (coupon.getEndDate() != null && today.isAfter(coupon.getEndDate()))) {
            throw bad("Ma giam gia chua co hieu luc hoac da het han");
        }
        if (coupon.getMinOrderValue() != null && request.orderValue().compareTo(coupon.getMinOrderValue()) < 0) {
            throw bad("Don hang chua dat gia tri toi thieu");
        }
        if (coupon.getUsageLimit() != null && usedCount(coupon) >= coupon.getUsageLimit()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma giam gia da het luot");
        }
        BigDecimal value = coupon.getDiscountValue();
        if (value == null || value.signum() <= 0 || coupon.getDiscountType() == null
                || (coupon.getDiscountType() == DiscountType.PERCENTAGE
                        && value.compareTo(BigDecimal.valueOf(100)) > 0)) {
            throw bad("Cau hinh ma giam gia khong hop le");
        }
        BigDecimal discount = coupon.getDiscountType() == DiscountType.PERCENTAGE
                ? request.orderValue().multiply(value).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                : value;
        // A fixed discount can never make the payable amount negative.
        discount = discount.min(request.orderValue()).setScale(2, RoundingMode.HALF_UP);
        return new CouponValidationResponse(coupon.getCode(), request.orderValue(), discount,
                request.orderValue().subtract(discount).setScale(2, RoundingMode.HALF_UP));
    }

    private void validateDefinition(CouponRequest request) {
        if (request.startDate() != null && request.endDate() != null
                && request.startDate().isAfter(request.endDate())) {
            throw bad("Ngay bat dau phai truoc hoac bang ngay ket thuc");
        }
        if (request.discountType() == DiscountType.PERCENTAGE
                && request.discountValue().compareTo(BigDecimal.valueOf(100)) > 0) {
            throw bad("Phan tram giam gia khong duoc vuot 100");
        }
    }

    private void apply(Coupon coupon, CouponRequest request) {
        String code = request.code().trim().toUpperCase(Locale.ROOT);
        coupons.findByCode(code).filter(other -> !other.getCouponID().equals(coupon.getCouponID()))
                .ifPresent(other -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma giam gia da ton tai");
                });
        coupon.setCode(code);
        coupon.setDiscountType(request.discountType());
        coupon.setDiscountValue(request.discountValue());
        coupon.setMinOrderValue(request.minOrderValue());
        coupon.setStartDate(request.startDate());
        coupon.setEndDate(request.endDate());
        coupon.setUsageLimit(request.usageLimit());
        coupon.setIsActive(request.isActive());
    }

    private CouponResponse save(Coupon coupon) {
        try {
            return CouponResponse.from(coupons.saveAndFlush(coupon));
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma giam gia da ton tai", exception);
        }
    }

    private Coupon requireCoupon(Long id) {
        return coupons.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay ma giam gia"));
    }

    private Coupon lockedCoupon(Long id) {
        Coupon coupon = requireCoupon(id);
        // Refresh is required: find() alone may return the pre-lock first-level cached
        // entity.
        entityManager.refresh(coupon, LockModeType.PESSIMISTIC_WRITE);
        return coupon;
    }

    private int usedCount(Coupon coupon) {
        return coupon.getUsedCount() == null ? 0 : coupon.getUsedCount();
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
