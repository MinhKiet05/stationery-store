package com.example.backend.dto.returns;

import com.example.backend.model.ReturnStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateReturnStatusRequest(@NotNull ReturnStatus status,
                                        @Size(max = 1000) String adminNote) {}
