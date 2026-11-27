package com.example.backend.dto.returns;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

public record RefundPreviewRequest(@NotNull Long orderID, @NotEmpty List<@Valid ReturnItemRequest> items) {}
