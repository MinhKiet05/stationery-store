package com.example.backend.dto.review;

import java.time.LocalDateTime;

public record AdminReviewRow(Long reviewID, Long productID, String productTitle, String productImage,
        Long userID, String username, String fullName, Integer rating, String comment, LocalDateTime reviewDate) {}
