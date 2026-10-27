package com.example.backend.services.impl;

import com.example.backend.dto.cart.AddCartItemRequest;
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
        CartResponse result = null;

        for (AddCartItemRequest item : request.items()) {
            result = cartService.addItem(username, item);
        }

        return result;
    }
}