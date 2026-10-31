package com.example.backend.services;

import com.example.backend.dto.coupon.*;
import com.example.backend.model.*;
import com.example.backend.repositories.CouponRepository;
import com.example.backend.services.impl.CouponServiceImpl;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CouponServiceTest {
    private final CouponRepository coupons = mock(CouponRepository.class);
    private final EntityManager em = mock(EntityManager.class);
    private final CouponServiceImpl service = new CouponServiceImpl(coupons, em);
    private Coupon coupon;

    @BeforeEach
    void setup() {
        coupon = Coupon.builder().couponID(1L).code("SAVE10").discountType(DiscountType.PERCENTAGE)
                .discountValue(new BigDecimal("10")).minOrderValue(new BigDecimal("100"))
                .usageLimit(5).usedCount(2).startDate(LocalDate.now()).endDate(LocalDate.now()).build();
        when(coupons.findByCode("SAVE10")).thenReturn(Optional.of(coupon));
        when(coupons.findById(1L)).thenReturn(Optional.of(coupon));
    }

    @Test
    void previewNormalizesCodeIncludesDateBoundariesAndDoesNotConsumeUsage() {
        var result = service.validate(new ValidateCouponRequest(" save10 ", new BigDecimal("100.05")));
        assertThat(result.discountAmount()).isEqualByComparingTo("10.01");
        assertThat(result.totalAmount()).isEqualByComparingTo("90.04");
        assertThat(coupon.getUsedCount()).isEqualTo(2);
        verify(coupons, never()).saveAndFlush(any());
    }

    @Test
    void fixedDiscountIsCappedAtSubtotal() {
        coupon.setDiscountType(DiscountType.FIXED_AMOUNT);
        coupon.setDiscountValue(new BigDecimal("999"));
        var result = service.validate(new ValidateCouponRequest("SAVE10", new BigDecimal("100")));
        assertThat(result.discountAmount()).isEqualByComparingTo("100");
        assertThat(result.totalAmount()).isEqualByComparingTo("0");
    }

    @Test
    void rejectsInactiveFutureExpiredMinimumAndExhaustedCoupons() {
        coupon.setIsActive(false); assertPreviewStatus(400);
        coupon.setIsActive(true); coupon.setStartDate(LocalDate.now().plusDays(1)); assertPreviewStatus(400);
        coupon.setStartDate(null); coupon.setEndDate(LocalDate.now().minusDays(1)); assertPreviewStatus(400);
        coupon.setEndDate(null); coupon.setMinOrderValue(new BigDecimal("101")); assertPreviewStatus(400);
        coupon.setMinOrderValue(null); coupon.setUsedCount(5); assertPreviewStatus(409);
    }

    @Test
    void allowsUnlimitedUsageAndOpenDateRange() {
        coupon.setUsageLimit(null); coupon.setStartDate(null); coupon.setEndDate(null);
        assertThat(service.validate(new ValidateCouponRequest("SAVE10", new BigDecimal("100"))).totalAmount())
                .isEqualByComparingTo("90");
    }

    @Test
    void rejectsInvalidDefinitionsAndMissingIds() {
        assertStatus(400, () -> service.create(request(new BigDecimal("101"), 5,
                LocalDate.now(), LocalDate.now())));
        assertStatus(400, () -> service.create(request(BigDecimal.TEN, 5,
                LocalDate.now().plusDays(1), LocalDate.now())));
        assertStatus(404, () -> service.deactivate(999L));
        assertStatus(400, () -> service.validate(new ValidateCouponRequest("UNKNOWN", BigDecimal.TEN)));
    }

    @Test
    void updateLocksAndPreservesUsedCountAndRejectsLowerLimit() {
        assertStatus(409, () -> service.update(1L, request(BigDecimal.TEN, 1, null, null)));
        when(coupons.saveAndFlush(coupon)).thenReturn(coupon);
        var result = service.update(1L, request(BigDecimal.TEN, 3, null, null));
        assertThat(result.usedCount()).isEqualTo(2);
        verify(em, times(2)).refresh(coupon, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void deactivationPreservesHistoryAndUsage() {
        service.deactivate(1L);
        assertThat(coupon.getIsActive()).isFalse();
        assertThat(coupon.getUsedCount()).isEqualTo(2);
        verify(coupons, never()).delete(any());
        verify(em).refresh(coupon, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void duplicateCodeAndConcurrentUniqueViolationReturnConflict() {
        assertStatus(409, () -> service.create(request(BigDecimal.TEN, 5, null, null)));
        when(coupons.findByCode("SAVE10")).thenReturn(Optional.empty());
        when(coupons.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("duplicate"));
        assertStatus(409, () -> service.create(request(BigDecimal.TEN, 5, null, null)));
    }

    @Test
    void createNormalizesAndStartsUsageAtZero() {
        when(coupons.findByCode("SAVE10")).thenReturn(Optional.empty());
        when(coupons.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        var result = service.create(request(BigDecimal.TEN, 5, null, null));
        assertThat(result.code()).isEqualTo("SAVE10");
        assertThat(result.usedCount()).isZero();
    }

    private CouponRequest request(BigDecimal value, Integer limit, LocalDate start, LocalDate end) {
        return new CouponRequest("save10", DiscountType.PERCENTAGE, value, BigDecimal.ZERO, start, end, limit, true);
    }

    private void assertPreviewStatus(int status) {
        assertStatus(status, () -> service.validate(new ValidateCouponRequest("SAVE10", new BigDecimal("100"))));
    }

    private void assertStatus(int status, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode().value()).isEqualTo(status));
    }
}
