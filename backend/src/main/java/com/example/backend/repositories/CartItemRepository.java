package com.example.backend.repositories;

import com.example.backend.model.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {
    // Response mapping only: keep the checkout/lock path on its existing method.
    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"variant", "variant.product"})
    @org.springframework.data.jpa.repository.Query("select i from CartItem i where i.cart.cartID = :cartID")
    List<CartItem> findForResponseByCartID(@org.springframework.data.repository.query.Param("cartID") Long cartID);
    List<CartItem> findByCart_CartID(Long cartID);
    Optional<CartItem> findByCart_CartIDAndVariant_VariantID(Long cartID, Long variantID);
    Optional<CartItem> findByCartItemIDAndCart_User_UserID(Long cartItemID, Long userID);
    long deleteByCart_CartID(Long cartID);
}
