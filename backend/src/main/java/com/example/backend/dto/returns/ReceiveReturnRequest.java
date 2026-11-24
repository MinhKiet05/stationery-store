package com.example.backend.dto.returns;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public record ReceiveReturnRequest(@NotEmpty List<@NotNull @Valid Item> items) {
    public record Item(@NotNull @Positive Long returnItemID,
            @NotNull @DecimalMin("0") @DecimalMax("2147483647") @Digits(integer = 10, fraction = 0) BigDecimal receivedQuantity) {}
}
