package com.example.backend.dto.ai;
import com.example.backend.dto.product.ProductResponse;
import java.util.List;
public record ChatResponse(String reply, List<ProductResponse> products, String source) {}
