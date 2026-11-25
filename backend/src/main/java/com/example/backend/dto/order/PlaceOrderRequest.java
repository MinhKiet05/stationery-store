package com.example.backend.dto.order;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import com.example.backend.model.ShippingMethod;
public record PlaceOrderRequest(
    @NotBlank @Size(max=500) String shippingAddress,
    @NotBlank @Size(max=30) String contactPhone,
    @NotBlank @Size(max=50) String paymentMethod,
    @Size(max=50) String couponCode,
    ShippingMethod shippingMethod,
    @jakarta.validation.constraints.DecimalMin("0") java.math.BigDecimal expectedTotalAmount
) {
    public PlaceOrderRequest(String address, String phone, String payment, String coupon) {
        this(address, phone, payment, coupon, ShippingMethod.STANDARD, null);
    }
    public PlaceOrderRequest(String address, String phone, String payment, String coupon, ShippingMethod shipping) {
        this(address, phone, payment, coupon, shipping, null);
    }
}
