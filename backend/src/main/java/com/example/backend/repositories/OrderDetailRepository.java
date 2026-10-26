package com.example.backend.repositories;

import com.example.backend.model.OrderDetail;
import com.example.backend.model.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface OrderDetailRepository extends JpaRepository<OrderDetail, Long> {
    List<OrderDetail> findByOrder_OrderID(Long orderID);
    List<OrderDetail> findByVariant_VariantID(Long variantID);
    boolean existsByOrder_User_UserIDAndOrder_StatusAndVariant_Product_ProductID(
            Long userID, OrderStatus status, Long productID);
    // Top-selling variant report: quantity across delivered orders.
    @Query("SELECT d.variant.variantID, SUM(d.quantity) FROM OrderDetail d " +
           "WHERE d.order.status = :status AND d.order.orderDate >= :startDate " +
           "AND d.order.orderDate < :endDate " +
           "GROUP BY d.variant.variantID ORDER BY SUM(d.quantity) DESC")
    List<Object[]> sumQuantityByVariant(@Param("status") OrderStatus status,
                                        @Param("startDate") LocalDateTime startDate,
                                        @Param("endDate") LocalDateTime endDate);
}
