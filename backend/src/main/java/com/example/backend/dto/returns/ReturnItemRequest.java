package com.example.backend.dto.returns;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ReturnItemRequest(@NotNull Long orderDetailID, @NotNull @Min(1) Integer quantity) {}
