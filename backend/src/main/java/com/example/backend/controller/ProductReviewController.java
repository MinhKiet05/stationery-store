package com.example.backend.controller;

import com.example.backend.dto.review.ReviewRequest;
import com.example.backend.dto.review.ReviewResponse;
import com.example.backend.services.ReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/products/{productID}/reviews")
@RequiredArgsConstructor
public class ProductReviewController {
    private final ReviewService service;

    @GetMapping
    public List<ReviewResponse> list(@PathVariable Long productID) {
        return service.getByProduct(productID);
    }

    @PostMapping
    public ResponseEntity<ReviewResponse> create(@PathVariable Long productID,
                                                 @Valid @RequestBody ReviewRequest request,
                                                 Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(productID, authentication.getName(), request));
    }
}
