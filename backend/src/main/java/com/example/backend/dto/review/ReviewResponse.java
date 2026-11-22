package com.example.backend.dto.review;

import java.time.LocalDateTime;
import java.util.List;

public record ReviewResponse(
        Long reviewID,
        Long productID,
        Long userID,
        String username,
        Integer rating,
        String comment,
        LocalDateTime reviewDate,
        List<ReviewImageResponse> images
) {}
