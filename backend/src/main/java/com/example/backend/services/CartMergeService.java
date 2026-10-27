package com.example.backend.services;

import com.example.backend.dto.cart.CartResponse;
import com.example.backend.dto.cart.MergeCartRequest;

public interface CartMergeService {

    CartResponse mergeCart(
            String username,
            MergeCartRequest request
    );
}