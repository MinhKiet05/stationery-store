package com.example.backend.repositories;

import com.example.backend.model.Order;
import com.example.backend.model.OrderStatus;
import com.example.backend.model.ReturnStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** Read-only aggregates for task 14; existing module repositories stay independent. */
public interface StatisticsRepository extends Repository<Order, Long> {

    String ORDER_RANGE = """
            WHERE o.orderDate >= :start AND o.orderDate < :end
            """;

    // A pending return does not undo the original sale. Refund amounts are not
    // recorded by the current model, so these totals explicitly precede refunds.
    String DELIVERED = """
              AND (o.status = com.example.backend.model.OrderStatus.DELIVERED
                OR (o.status = com.example.backend.model.OrderStatus.RETURN_PENDING
                    AND o.deliveredAt IS NOT NULL))
            """;

    interface SalesTotals {
        long getOrderCount();
        BigDecimal getRevenue();
        BigDecimal getDiscount();
        long getPurchasingCustomers();
    }

    interface RevenueRow {
        Integer getYear();
        Integer getMonth();
        Integer getDay();
        long getOrderCount();
        BigDecimal getRevenue();
        BigDecimal getDiscount();
    }

    interface ProductRow {
        Long getProductID();
        String getTitle();
        long getQuantitySold();
        BigDecimal getRevenue();
    }

    interface CustomerRow {
        Long getUserID();
        String getUsername();
        String getFullName();
        long getOrderCount();
        BigDecimal getTotalPaid();
    }

    interface CustomerTotals {
        long getTotalCustomers();
        long getActiveCustomers();
    }

    interface OrderStatusTotal {
        OrderStatus getStatus();
        long getCount();
    }

    interface ReturnStatusTotal {
        ReturnStatus getStatus();
        long getCount();
    }

    @Query("SELECT COUNT(o) FROM Order o " + ORDER_RANGE)
    long countOrders(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
            SELECT COUNT(o) AS orderCount, COALESCE(SUM(o.totalAmount), 0) AS revenue,
                   COALESCE(SUM(o.discountAmount), 0) AS discount,
                   COUNT(DISTINCT CASE WHEN o.user.role = com.example.backend.model.UserRole.CUSTOMER
                         THEN o.user.userID ELSE NULL END) AS purchasingCustomers
            FROM Order o
            """ + ORDER_RANGE + DELIVERED)
    SalesTotals findSalesTotals(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("SELECT COALESCE(SUM(d.quantity), 0) FROM OrderDetail d JOIN d.order o " + ORDER_RANGE + DELIVERED)
    long sumQuantitySold(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
            SELECT d.variant.product.productID AS productID, d.variant.product.title AS title,
                   SUM(d.quantity) AS quantitySold, SUM(d.subTotal) AS revenue
            FROM OrderDetail d JOIN d.order o LEFT JOIN d.variant.product.productType pt
            """ + ORDER_RANGE + DELIVERED + """
              AND (:productTypeID IS NULL OR pt.productTypeID = :productTypeID)
            GROUP BY d.variant.product.productID, d.variant.product.title
            """)
    List<ProductRow> findTopProducts(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end, @Param("productTypeID") Long productTypeID, Pageable pageable);

    @Query("""
            SELECT o.user.userID AS userID, o.user.username AS username, o.user.fullName AS fullName,
                   COUNT(o) AS orderCount,
                   COALESCE(SUM(CASE WHEN o.isPaid = true THEN o.totalAmount ELSE 0 END), 0) AS totalPaid
            FROM Order o
            """ + ORDER_RANGE + DELIVERED + """
              AND o.user.role = com.example.backend.model.UserRole.CUSTOMER
            GROUP BY o.user.userID, o.user.username, o.user.fullName
            """)
    List<CustomerRow> findTopCustomers(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end, Pageable pageable);

    @Query("""
            SELECT YEAR(o.orderDate) AS year, MONTH(o.orderDate) AS month, DAY(o.orderDate) AS day,
                   COUNT(o) AS orderCount, COALESCE(SUM(o.totalAmount), 0) AS revenue,
                   COALESCE(SUM(o.discountAmount), 0) AS discount
            FROM Order o
            """ + ORDER_RANGE + DELIVERED + """
            GROUP BY YEAR(o.orderDate), MONTH(o.orderDate), DAY(o.orderDate)
            ORDER BY YEAR(o.orderDate), MONTH(o.orderDate), DAY(o.orderDate)
            """)
    List<RevenueRow> findDailyRevenue(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
            SELECT YEAR(o.orderDate) AS year, MONTH(o.orderDate) AS month, 1 AS day,
                   COUNT(o) AS orderCount, COALESCE(SUM(o.totalAmount), 0) AS revenue,
                   COALESCE(SUM(o.discountAmount), 0) AS discount
            FROM Order o
            """ + ORDER_RANGE + DELIVERED + """
            GROUP BY YEAR(o.orderDate), MONTH(o.orderDate)
            ORDER BY YEAR(o.orderDate), MONTH(o.orderDate)
            """)
    List<RevenueRow> findMonthlyRevenue(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
            SELECT YEAR(o.orderDate) AS year, 1 AS month, 1 AS day,
                   COUNT(o) AS orderCount, COALESCE(SUM(o.totalAmount), 0) AS revenue,
                   COALESCE(SUM(o.discountAmount), 0) AS discount
            FROM Order o
            """ + ORDER_RANGE + DELIVERED + """
            GROUP BY YEAR(o.orderDate)
            ORDER BY YEAR(o.orderDate)
            """)
    List<RevenueRow> findYearlyRevenue(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("SELECT o.status AS status, COUNT(o) AS count FROM Order o " + ORDER_RANGE + " GROUP BY o.status")
    List<OrderStatusTotal> countOrdersByStatus(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("""
            SELECT r.status AS status, COUNT(r) AS count FROM ReturnRequest r
            WHERE r.createdAt >= :start AND r.createdAt < :end
            GROUP BY r.status
            """)
    List<ReturnStatusTotal> countReturnRequestsByStatus(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);

    @Query("""
            SELECT COUNT(u) AS totalCustomers,
                   COALESCE(SUM(CASE WHEN u.isActive = true THEN 1L ELSE 0L END), 0L) AS activeCustomers
            FROM User u WHERE u.role = com.example.backend.model.UserRole.CUSTOMER
            """)
    CustomerTotals findCustomerTotals();

    @Query("""
            SELECT COUNT(u) FROM User u
            WHERE u.role = com.example.backend.model.UserRole.CUSTOMER
              AND u.createdAt >= :start AND u.createdAt < :end
            """)
    long countNewCustomers(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
