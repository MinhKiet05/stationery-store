package com.example.backend.dto.order;
import com.example.backend.model.OrderStatus;
import jakarta.validation.constraints.NotNull;
public record UpdateOrderStatusRequest(@NotNull OrderStatus status) {}
