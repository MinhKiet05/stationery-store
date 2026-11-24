package com.example.backend.repositories;

import com.example.backend.model.Order;
import com.example.backend.model.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long>, JpaSpecificationExecutor<Order> {
    @Query("""
            select new com.example.backend.dto.dashboard.DashboardOrderResponse(
                o.orderID, o.orderDate, u.fullName, u.username, o.totalAmount, o.status, o.paymentMethod, o.isPaid)
            from Order o join o.user u
            where o.orderDate >= :start and o.orderDate < :end
            order by o.orderDate desc, o.orderID desc
            """)
    Page<com.example.backend.dto.dashboard.DashboardOrderResponse> findDashboardOrders(
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end, Pageable pageable);

    Optional<Order> findByOrderIDAndUser_UserID(Long orderID, Long userID);
    List<Order> findByUser_UserIDOrderByOrderDateDesc(Long userID);
    Page<Order> findByUser_UserID(Long userID, Pageable pageable);
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);
    List<Order> findByOrderDateBetween(LocalDateTime start, LocalDateTime end);
    long countByStatus(OrderStatus status);
    @Query("SELECT COALESCE(SUM(o.totalAmount), 0) FROM Order o " +
           "WHERE o.status = :status AND o.orderDate >= :startDate AND o.orderDate < :endDate")
    BigDecimal calculateRevenue(@Param("status") OrderStatus status,
                               @Param("startDate") LocalDateTime startDate,
                               @Param("endDate") LocalDateTime endDate);
}
