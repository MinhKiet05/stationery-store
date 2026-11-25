package com.example.backend.services;

import com.example.backend.dto.dashboard.DashboardOrderResponse;
import com.example.backend.dto.productvariant.ProductVariantResponse;
import com.example.backend.repositories.OrderRepository;
import com.example.backend.repositories.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@PreAuthorize("hasRole('ADMIN')")
public class DashboardService {
    private final OrderRepository orders;
    private final ProductVariantRepository variants;

    public Page<DashboardOrderResponse> recentOrders(LocalDate startDate, LocalDate endDate, int page, int size) {
        if (startDate == null || endDate == null || startDate.isAfter(endDate)
                || startDate.getYear() < 1 || endDate.getYear() > 9998) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khoang thoi gian khong hop le");
        }
        return orders.findDashboardOrders(startDate.atStartOfDay(), endDate.plusDays(1).atStartOfDay(), paging(page, size));
    }

    public Page<ProductVariantResponse> lowStock(int page, int size) {
        return variants.findLowStock(paging(page, size));
    }

    private PageRequest paging(int page, int size) {
        if (page < 0 || size < 1 || size > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phan trang khong hop le");
        }
        return PageRequest.of(page, size);
    }
}
