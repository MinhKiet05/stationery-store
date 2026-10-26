package com.example.backend.repositories;

import com.example.backend.model.ReturnRequest;
import com.example.backend.model.ReturnStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ReturnRequestRepository extends JpaRepository<ReturnRequest, Long> {
    List<ReturnRequest> findByOrder_OrderID(Long orderID);
    List<ReturnRequest> findByUser_UserID(Long userID);
    Page<ReturnRequest> findByStatus(ReturnStatus status, Pageable pageable);
    boolean existsByOrder_OrderID(Long orderID);
    List<ReturnRequest> findByOrder_OrderIDAndStatus(Long orderID, ReturnStatus status);
}
