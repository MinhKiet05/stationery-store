package com.example.backend.repositories;
import com.example.backend.model.Order;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
/** Add-on repository to avoid editing the existing OrderRepository. */
public interface OrderLockRepository extends JpaRepository<Order, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.orderID = :id")
    Optional<Order> lockById(@Param("id") Long id);
}
