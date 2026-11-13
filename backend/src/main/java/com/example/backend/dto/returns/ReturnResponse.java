package com.example.backend.dto.returns;

import com.example.backend.model.ReturnStatus;
import java.time.LocalDateTime;
import java.util.List;

public record ReturnResponse(Long returnID, Long orderID, Long userID, String reason,
                             List<String> evidenceUrls, ReturnStatus status,
                             LocalDateTime createdAt, LocalDateTime processedAt,
                             String adminNote, List<ReturnItemResponse> items) {}
