package com.example.backend.dto.returns;

import com.example.backend.model.ReturnStatus;
import java.time.LocalDateTime;

public record AdminReturnRow(Long returnID, Long orderID, Long userID, String username, String customerName,
        String reason, ReturnStatus status, LocalDateTime createdAt, LocalDateTime processedAt, String adminNote) {}
