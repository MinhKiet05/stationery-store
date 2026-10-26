package com.example.backend.services.impl;

import com.example.backend.dto.cart.*;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.CartService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CartServiceImpl implements CartService {
    private final UserRepository users;
    private final CartRepository carts;
    private final CartItemRepository cartItems;
    private final ProductVariantRepository variants;
    private final EntityManager em;

    @Override
    @Transactional(readOnly = true)
    public CartResponse getCart(String username) {
        User user = findUser(username);
        return carts.findByUser_UserID(user.getUserID())
                .map(this::toResponse)
                .orElseGet(() -> emptyCart(null));
    }

    @Override
    @Transactional
    public CartResponse addItem(String username, AddCartItemRequest request) {
        if (request.variantID() == null || request.variantID() <= 0) {
            throw bad("variantID khong hop le");
        }
        User user = findUser(username);
        Cart cart = lockedCart(user);

        ProductVariant variant = variants.findById(request.variantID())
                .orElseThrow(() -> notFound("Khong tim thay bien the san pham"));
        checkAvailable(variant);

        CartItem item = cartItems.findByCart_CartIDAndVariant_VariantID(
                cart.getCartID(), variant.getVariantID()).orElse(null);
        int current = item == null ? 0 : item.getQuantity();
        int desired;
        try {
            desired = Math.addExact(current, request.quantity());
        } catch (ArithmeticException ex) {
            throw bad("So luong vuot qua gioi han");
        }
        checkStock(variant, desired);
        if (item == null) {
            item = new CartItem();
            item.setCart(cart);
            item.setVariant(variant);
        }
        item.setQuantity(desired);
        cartItems.saveAndFlush(item);
        return toResponse(cart);
    }

    @Override
    @Transactional
    public CartResponse updateItem(String username, Long itemID, UpdateCartItemRequest request) {
        Cart cart = existingLockedCart(username);
        CartItem item = cartItems.findByCartItemIDAndCart_User_UserID(
                itemID, cart.getUser().getUserID())
                .orElseThrow(() -> notFound("Khong tim thay muc gio hang"));
        ProductVariant variant = item.getVariant();
        checkAvailable(variant);
        checkStock(variant, request.quantity());
        item.setQuantity(request.quantity());
        cartItems.saveAndFlush(item);
        return toResponse(cart);
    }

    @Override
    @Transactional
    public CartResponse removeItem(String username, Long itemID) {
        Cart cart = existingLockedCart(username);
        CartItem item = cartItems.findByCartItemIDAndCart_User_UserID(
                itemID, cart.getUser().getUserID())
                .orElseThrow(() -> notFound("Khong tim thay muc gio hang"));
        cartItems.delete(item);
        cartItems.flush();
        return toResponse(cart);
    }

    @Override
    @Transactional
    public CartResponse clearCart(String username) {
        User user = findUser(username);
        Cart cart = carts.findByUser_UserID(user.getUserID()).orElse(null);
        if (cart == null) return emptyCart(null);
        em.find(Cart.class, cart.getCartID(), LockModeType.PESSIMISTIC_WRITE);
        // Delete individually to keep the persistence context in sync.
        List<CartItem> items = cartItems.findByCart_CartID(cart.getCartID());
        cartItems.deleteAll(items);
        cartItems.flush();
        return emptyCart(cart.getCartID());
    }

    private User findUser(String username) {
        if (username == null || username.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chua dang nhap");
        }
        User user = users.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Tai khoan khong ton tai"));
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tai khoan bi khoa");
        }
        return user;
    }

    private Cart lockedCart(User user) {
        // Serialize first-cart creation by locking the user row.
        User lockedUser = em.find(User.class, user.getUserID(), LockModeType.PESSIMISTIC_WRITE);
        Cart cart = carts.findByUser_UserID(lockedUser.getUserID()).orElse(null);
        if (cart == null) {
            cart = new Cart();
            cart.setUser(lockedUser);
            cart = carts.saveAndFlush(cart);
        }
        return em.find(Cart.class, cart.getCartID(), LockModeType.PESSIMISTIC_WRITE);
    }

    private Cart existingLockedCart(String username) {
        User user = findUser(username);
        Cart cart = carts.findByUser_UserID(user.getUserID())
                .orElseThrow(() -> notFound("Gio hang chua ton tai"));
        return em.find(Cart.class, cart.getCartID(), LockModeType.PESSIMISTIC_WRITE);
    }

    private void checkAvailable(ProductVariant variant) {
        Product product = variant.getProduct();
        if (!Boolean.TRUE.equals(variant.getAvailable())
                || product == null
                || !Boolean.TRUE.equals(product.getAvailable())
                || !Boolean.TRUE.equals(product.getIsActive())) {
            throw bad("San pham khong con kinh doanh");
        }
        if (variant.getPrice() == null || variant.getPrice().signum() < 0) {
            throw bad("Gia san pham khong hop le");
        }
    }

    private void checkStock(ProductVariant variant, int quantity) {
        if (quantity <= 0) throw bad("So luong phai lon hon 0");
        if (variant.getStockQuantity() == null || variant.getStockQuantity() < quantity) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Khong du ton kho cho bien the " + variant.getVariantID());
        }
    }

    private CartResponse toResponse(Cart cart) {
        List<CartItemResponse> responses = cartItems.findByCart_CartID(cart.getCartID())
                .stream()
                .sorted(Comparator.comparing(CartItem::getCartItemID))
                .map(this::toItemResponse)
                .toList();
        BigDecimal subtotal = responses.stream()
                .map(CartItemResponse::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int totalQuantity = responses.stream()
                .mapToInt(CartItemResponse::quantity)
                .sum();
        return new CartResponse(cart.getCartID(), responses, totalQuantity, subtotal);
    }

    private CartItemResponse toItemResponse(CartItem item) {
        ProductVariant variant = item.getVariant();
        Product product = variant.getProduct();
        BigDecimal price = variant.getPrice() == null ? BigDecimal.ZERO : variant.getPrice();
        int quantity = item.getQuantity();
        boolean available = Boolean.TRUE.equals(variant.getAvailable())
                && Boolean.TRUE.equals(product.getAvailable())
                && Boolean.TRUE.equals(product.getIsActive());
        return new CartItemResponse(
                item.getCartItemID(),
                variant.getVariantID(),
                product.getProductID(),
                product.getTitle(),
                variant.getTitle(),
                variant.getSku(),
                quantity,
                price,
                price.multiply(BigDecimal.valueOf(quantity)),
                variant.getStockQuantity(),
                available
        );
    }

    private CartResponse emptyCart(Long cartID) {
        return new CartResponse(cartID, List.of(), 0, BigDecimal.ZERO);
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
