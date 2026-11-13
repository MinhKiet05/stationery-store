package com.example.backend.services;

import com.example.backend.dto.review.ReviewRequest;
import com.example.backend.dto.review.ReviewResponse;
import java.util.List;

public interface ReviewService {
    List<ReviewResponse> getByProduct(Long productID);
    ReviewResponse create(Long productID, String username, ReviewRequest request);
    ReviewResponse update(Long reviewID, String username, ReviewRequest request);
    void delete(Long reviewID, String username);
}
