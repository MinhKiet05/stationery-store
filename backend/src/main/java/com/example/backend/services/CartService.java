package com.example.backend.services;
import com.example.backend.dto.cart.*;

public interface CartService {
    CartResponse getCart(String username);
    CartResponse addItem(String username, AddCartItemRequest request);
    CartResponse updateItem(String username, Long itemID, UpdateCartItemRequest request);
    CartResponse removeItem(String username, Long itemID);
    CartResponse clearCart(String username);
}
