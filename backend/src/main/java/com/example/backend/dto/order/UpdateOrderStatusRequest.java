package com.example.backend.dto.order;
import com.example.backend.model.OrderStatus;
import jakarta.validation.constraints.NotNull;
public record UpdateOrderStatusRequest(@NotNull OrderStatus status, OrderStatus expectedStatus, Boolean expectedPaid) {
    // Preserve existing Java callers and the original status-only JSON contract.
    public UpdateOrderStatusRequest(OrderStatus status) { this(status, null, null); }
}
