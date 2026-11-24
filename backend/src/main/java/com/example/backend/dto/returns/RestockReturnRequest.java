package com.example.backend.dto.returns;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public record RestockReturnRequest(@NotEmpty List<@NotNull @Valid Item> items, @Size(max = 1000) String inspectionNote) {
    public record Item(@NotNull @Positive Long returnItemID,
            @NotNull @DecimalMin("0") @DecimalMax("2147483647") @Digits(integer = 10, fraction = 0) BigDecimal goodQuantity,
            @NotNull @DecimalMin("0") @DecimalMax("2147483647") @Digits(integer = 10, fraction = 0) BigDecimal damagedQuantity) {}
}
