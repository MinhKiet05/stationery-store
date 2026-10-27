package com.example.backend.dto.cart;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record MergeCartRequest(
        @NotEmpty
        @Size(max = 100)
        List<@Valid AddCartItemRequest> items
) {}