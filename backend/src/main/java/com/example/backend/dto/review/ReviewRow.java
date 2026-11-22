package com.example.backend.dto.review;

import java.time.LocalDateTime;

/** Flat projection avoids loading user credentials and collection N+1 queries. */
public record ReviewRow(Long reviewID, Long productID, Long userID, String username,
                        Integer rating, String comment, LocalDateTime reviewDate,
                        String imageUrl, Integer imagePosition) {}
