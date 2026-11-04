package com.example.backend.dto.returns;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateReturnRequest(
        @NotNull Long orderID,
        @NotBlank @Size(max = 1000) String reason,
        @NotEmpty @Size(max = 5) List<@NotBlank String> evidenceUrls,
        @NotEmpty List<@Valid ReturnItemRequest> items
) {}
