package com.example.backend.services;

import com.example.backend.dto.review.ReviewRequest;
import com.example.backend.dto.review.ReviewResponse;
import java.util.List;
import org.springframework.web.multipart.MultipartFile;

public interface ReviewService {
    List<ReviewResponse> getByProduct(Long productID);
    ReviewResponse create(Long productID, String username, ReviewRequest request);
    ReviewResponse create(Long productID, String username, ReviewRequest request, List<MultipartFile> images);
    ReviewResponse update(Long reviewID, String username, ReviewRequest request);
    ReviewResponse update(Long reviewID, String username, ReviewRequest request,
                          List<MultipartFile> images, List<Integer> removeImagePositions);
    void delete(Long reviewID, String username);
    void adminDelete(Long reviewID);
}
