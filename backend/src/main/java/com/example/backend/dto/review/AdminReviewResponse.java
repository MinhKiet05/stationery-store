package com.example.backend.dto.review;

import java.util.List;

public record AdminReviewResponse(AdminReviewRow review, List<ReviewImageResponse> images) {}
