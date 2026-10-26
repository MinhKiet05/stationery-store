package com.example.backend.repositories;

import com.example.backend.model.ReturnRequestItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ReturnRequestItemRepository extends JpaRepository<ReturnRequestItem, Long> {
    List<ReturnRequestItem> findByReturnRequest_ReturnID(Long returnID);
    List<ReturnRequestItem> findByOrderDetail_OrderDetailID(Long orderDetailID);
}
