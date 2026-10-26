package com.example.backend.dto.order;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
public record PlaceOrderRequest(
    @NotBlank @Size(max=500) String shippingAddress,
    @NotBlank @Size(max=30) String contactPhone,
    @NotBlank @Size(max=50) String paymentMethod,
    String couponCode
) {}
