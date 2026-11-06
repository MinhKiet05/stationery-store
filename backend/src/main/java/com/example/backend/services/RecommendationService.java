package com.example.backend.services;
import com.example.backend.dto.ai.RecommendationResponse;
public interface RecommendationService {
    RecommendationResponse recommend(String username, int limit);
    RecommendationResponse popular(int limit);
}
