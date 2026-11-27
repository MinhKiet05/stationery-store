package com.example.backend.services.impl;

import com.example.backend.dto.cart.CartResponse;
import com.example.backend.dto.cart.MergeCartRequest;
import com.example.backend.services.CartMergeService;
import com.example.backend.services.CartService;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CartMergeServiceImpl implements CartMergeService {

    private final CartService cartService;

    @Override
    @Transactional
    public CartResponse mergeCart(
            String username,
            MergeCartRequest request
    ) {
        // Lock once and hydrate the complete response after every validated item is saved.
        return cartService.mergeItems(username, request.items());
    }
}
