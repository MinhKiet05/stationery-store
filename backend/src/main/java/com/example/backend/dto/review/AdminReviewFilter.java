package com.example.backend.dto.review;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;

public record AdminReviewFilter(String search, Integer rating,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
        ReviewSort sort) {
    public enum ReviewSort { NEWEST, OLDEST }
}
