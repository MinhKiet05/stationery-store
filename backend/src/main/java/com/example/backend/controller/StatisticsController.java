package com.example.backend.controller;

import com.example.backend.dto.statistics.*;
import com.example.backend.services.StatisticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/statistics")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class StatisticsController {

    private final StatisticsService statisticsService;

    @GetMapping("/overview")
    public StatisticsOverviewResponse getOverview(@ModelAttribute StatisticsDateRequest request) {
        return statisticsService.getOverview(request);
    }

    @GetMapping("/revenue")
    public StatisticsRevenueResponse getRevenue(@ModelAttribute StatisticsDateRequest request,
            @RequestParam(defaultValue = "DAY") StatisticsGroupBy groupBy) {
        return statisticsService.getRevenue(request, groupBy);
    }

    @GetMapping("/top-products")
    public List<TopProductResponse> getTopProducts(@ModelAttribute StatisticsDateRequest request,
            @RequestParam(required = false) Long productTypeID,
            @RequestParam(defaultValue = "QUANTITY") ProductRanking sortBy,
            @RequestParam(defaultValue = "10") int limit) {
        return statisticsService.getTopProducts(request, productTypeID, sortBy, limit);
    }

    @GetMapping("/orders")
    public StatisticsOrdersResponse getOrderStatistics(@ModelAttribute StatisticsDateRequest request) {
        return statisticsService.getOrderStatistics(request);
    }

    @GetMapping("/customers")
    public StatisticsCustomersResponse getCustomerStatistics(@ModelAttribute StatisticsDateRequest request,
            @RequestParam(defaultValue = "REVENUE") CustomerRanking sortBy,
            @RequestParam(defaultValue = "10") int limit) {
        return statisticsService.getCustomerStatistics(request, sortBy, limit);
    }
}
