package com.example.backend.services;

import com.example.backend.model.*;
import com.example.backend.dto.returns.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class RefundCalculatorTest {
    final RefundCalculator calculator = new RefundCalculator();
    Order order(long discount, long shipping, long... prices) {
        var o = Order.builder().orderID(6L).isPaid(true).discountAmount(BigDecimal.valueOf(discount))
                .shippingFee(BigDecimal.valueOf(shipping)).build();
        long sum = 0;
        for (int i=0;i<prices.length;i++) {
            sum += prices[i];
            o.getOrderDetails().add(OrderDetail.builder().orderDetailID((long)i+1).order(o).quantity(1)
                    .unitPrice(BigDecimal.valueOf(prices[i])).subTotal(BigDecimal.valueOf(prices[i])).build());
        }
        o.setTotalAmount(BigDecimal.valueOf(sum-discount+shipping)); return o;
    }
    RefundPreview quote(Order o, int... indexes) {
        return calculator.quote(o, Arrays.stream(indexes).mapToObj(i -> new ReturnItemRequest((long)i,1)).toList(), List.of());
    }
    @Test void st6MerchandiseDiscountIsAllocatedWithoutRefundingExpressShipping() {
        var o=order(1500000,40000,1000000,2000000);
        assertThat(quote(o,1).netAmount()).isEqualByComparingTo("500000");
        var b=quote(o,2); assertThat(b.grossAmount()).isEqualByComparingTo("2000000");
        assertThat(b.discountAmount()).isEqualByComparingTo("1000000");
        assertThat(b.netAmount()).isEqualByComparingTo("1000000");
        assertThat(quote(o,1,2).netAmount()).isEqualByComparingTo("1500000");
        assertThat(b.shippingRefund()).isNull(); assertThat(b.finalRefund()).isNull();
    }
    @Test void noCouponZeroPriceAndFullDiscountAreSupported() {
        assertThat(quote(order(0,0,100,0),1,2).netAmount()).isEqualByComparingTo("100");
        assertThat(quote(order(100,0,100,0),1,2).netAmount()).isZero();
        assertThat(quote(order(0,0,0),1).netAmount()).isZero();
    }
    @Test void fixedOrPercentageCouponSnapshotIsIndependentOfCurrentCouponAndProduct() {
        for(long discount:List.of(75L,50L)) {
            var o=order(discount,0,100,200); o.setCoupon(Coupon.builder().discountValue(new BigDecimal("999999")).isActive(false).build());
            o.getOrderDetails().forEach(d -> d.setVariant(ProductVariant.builder().price(BigDecimal.ONE).build()));
            assertThat(quote(o,1,2).netAmount()).isEqualByComparingTo(BigDecimal.valueOf(300-discount));
            o.setCoupon(null); assertThat(quote(o,1,2).discountAmount()).isEqualByComparingTo(BigDecimal.valueOf(discount));
        }
    }
    @Test void largestRemainderUsesStableDetailIdsAndNeverLosesAVnd() {
        var o=order(2,0,1,1,1); Collections.reverse(o.getOrderDetails());
        assertThat(quote(o,1).netAmount()).isZero(); assertThat(quote(o,2).netAmount()).isZero();
        assertThat(quote(o,3).netAmount()).isEqualByComparingTo("1");
        assertThat(quote(o,1,2,3).discountAmount()).isEqualByComparingTo("2");
    }
    @Test void partialRepeatedAndRejectedReturnsPreserveTheRemainingPool() {
        var o=order(1,0,300); var d=o.getOrderDetails().getFirst(); d.setQuantity(3); d.setUnitPrice(new BigDecimal("100"));
        List<ReturnRequestItem> previous=new ArrayList<>();
        for(int i=0;i<3;i++) {
            var p=calculator.quote(o,List.of(new ReturnItemRequest(1L,1)),previous);
            var r=ReturnRequest.builder().status(ReturnStatus.APPROVED).build();
            previous.add(ReturnRequestItem.builder().orderDetail(d).returnRequest(r).quantity(1).netAmount(p.netAmount()).build());
        }
        assertThat(previous.stream().map(ReturnRequestItem::getNetAmount).reduce(BigDecimal.ZERO,BigDecimal::add)).isEqualByComparingTo("299");
        assertThatThrownBy(() -> calculator.quote(o,List.of(new ReturnItemRequest(1L,1)),previous)).hasMessageContaining("409");
        previous.getFirst().getReturnRequest().setStatus(ReturnStatus.REJECTED);
        var replacement=calculator.quote(o,List.of(new ReturnItemRequest(1L,1)),previous);
        assertThat(replacement.netAmount().add(previous.get(1).getNetAmount()).add(previous.get(2).getNetAmount())).isEqualByComparingTo("299");
    }
    @Test void invalidOrUncertainHistoricalMoneyRequiresVerification() {
        var o=order(0,0,100); o.setTotalAmount(new BigDecimal("999"));
        assertThatThrownBy(() -> quote(o,1)).hasMessageContaining("409");
        o.setTotalAmount(new BigDecimal("100"));
        var old=ReturnRequestItem.builder().orderDetail(o.getOrderDetails().getFirst()).quantity(1)
                .returnRequest(ReturnRequest.builder().status(ReturnStatus.APPROVED).build()).build();
        assertThatThrownBy(() -> calculator.quote(o,List.of(new ReturnItemRequest(1L,1)),List.of(old))).hasMessageContaining("409");
    }
    @Test void duplicateForeignAndExcessQuantitiesAreRejected() {
        var o=order(0,0,100);
        assertThatThrownBy(() -> quote(o,1,1)).hasMessageContaining("400");
        assertThatThrownBy(() -> quote(o,2)).hasMessageContaining("400");
        assertThatThrownBy(() -> calculator.quote(o,List.of(new ReturnItemRequest(1L,2)),List.of())).hasMessageContaining("409");
    }
    @Test void unpaidOrderDoesNotClaimConfirmedPaymentOrFinalRefund() {
        var o=order(0,0,100); o.setIsPaid(false);
        assertThat(quote(o,1).paymentConfirmed()).isFalse(); assertThat(quote(o,1).finalRefund()).isNull();
    }
}
