package com.example.backend.services;

import com.example.backend.dto.order.PlaceOrderRequest;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.impl.OrderServiceImpl;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Regression tests simulate a usage count changing between initial load and row lock acquisition. */
class OrderCouponLockTest {
    private final UserRepository users = mock(UserRepository.class);
    private final CartRepository carts = mock(CartRepository.class);
    private final CartItemRepository items = mock(CartItemRepository.class);
    private final ProductVariantRepository variants = mock(ProductVariantRepository.class);
    private final CouponRepository coupons = mock(CouponRepository.class);
    private final OrderRepository orders = mock(OrderRepository.class);
    private final OrderLockRepository locks = mock(OrderLockRepository.class);
    private final EntityManager em = mock(EntityManager.class);
    private final OrderServiceImpl service = new OrderServiceImpl(users, carts, items, variants, coupons, orders, locks, em);
    private Coupon coupon;
    private User user;

    @BeforeEach
    void setup() {
        user = User.builder().userID(1L).username("customer").build();
        when(users.findByUsername("customer")).thenReturn(Optional.of(user));
        Cart cart = Cart.builder().cartID(1L).user(user).build();
        when(carts.findByUser_UserID(1L)).thenReturn(Optional.of(cart));
        when(em.find(Cart.class, 1L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(cart);
        ProductVariant variant = ProductVariant.builder().variantID(1L).title("Pen")
                .product(Product.builder().build()).price(new BigDecimal("100")).stockQuantity(10).build();
        when(variants.findWithLockByVariantID(1L)).thenReturn(Optional.of(variant));
        when(items.findByCart_CartID(1L)).thenReturn(List.of(CartItem.builder().variant(variant).quantity(1).build()));
        coupon = Coupon.builder().couponID(1L).code("SAVE").discountType(DiscountType.PERCENTAGE)
                .discountValue(BigDecimal.TEN).usageLimit(1).usedCount(0).build();
        when(coupons.findByCode("SAVE")).thenReturn(Optional.of(coupon));
        when(em.find(Coupon.class, 1L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(coupon);
    }

    @Test
    void checkoutRejectsCouponExhaustedWhileWaitingForLock() {
        doAnswer(call -> { coupon.setUsedCount(1); return null; })
                .when(em).refresh(coupon, LockModeType.PESSIMISTIC_WRITE);
        assertThatThrownBy(() -> service.placeOrder("customer", new PlaceOrderRequest("address", "123", "COD", "save")))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
        verify(orders, never()).saveAndFlush(any());
    }

    @Test
    void cancellationDecrementsRefreshedCountRatherThanCachedCount() {
        Order order = new Order();
        order.setUser(user); order.setStatus(OrderStatus.PENDING); order.setIsPaid(false); order.setCoupon(coupon);
        when(locks.lockById(1L)).thenReturn(Optional.of(order));
        doAnswer(call -> { coupon.setUsedCount(4); return null; })
                .when(em).refresh(coupon, LockModeType.PESSIMISTIC_WRITE);
        service.cancelOrder("customer", 1L);
        assertThat(coupon.getUsedCount()).isEqualTo(3);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELLED);
    }
}
