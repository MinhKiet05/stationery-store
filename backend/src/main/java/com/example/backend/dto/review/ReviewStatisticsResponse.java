package com.example.backend.dto.review;

public record ReviewStatisticsResponse(long totalReviews, Double averageRating, long fiveStarReviews, long lowStarReviews) {}
