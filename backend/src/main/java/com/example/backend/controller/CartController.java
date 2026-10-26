package com.example.backend.controller;

import com.example.backend.dto.cart.*;
import com.example.backend.services.CartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/cart")
@RequiredArgsConstructor
public class CartController {
    private final CartService service;

    @GetMapping
    public CartResponse get(Authentication auth) {
        return service.getCart(auth.getName());
    }

    @PostMapping("/items")
    public CartResponse add(@Valid @RequestBody AddCartItemRequest request, Authentication auth) {
        return service.addItem(auth.getName(), request);
    }

    @PutMapping("/items/{itemID}")
    public CartResponse update(@PathVariable Long itemID,
                               @Valid @RequestBody UpdateCartItemRequest request,
                               Authentication auth) {
        return service.updateItem(auth.getName(), itemID, request);
    }

    @DeleteMapping("/items/{itemID}")
    public CartResponse remove(@PathVariable Long itemID, Authentication auth) {
        return service.removeItem(auth.getName(), itemID);
    }

    @DeleteMapping
    public CartResponse clear(Authentication auth) {
        return service.clearCart(auth.getName());
    }
}
