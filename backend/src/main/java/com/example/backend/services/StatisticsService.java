package com.example.backend.services;

import com.example.backend.dto.statistics.*;

import java.util.List;

public interface StatisticsService {
    StatisticsOverviewResponse getOverview(StatisticsDateRequest request);
    StatisticsRevenueResponse getRevenue(StatisticsDateRequest request, StatisticsGroupBy groupBy);
    List<TopProductResponse> getTopProducts(StatisticsDateRequest request, Long productTypeID,
            ProductRanking sortBy, int limit);
    StatisticsOrdersResponse getOrderStatistics(StatisticsDateRequest request);
    StatisticsCustomersResponse getCustomerStatistics(StatisticsDateRequest request, CustomerRanking sortBy, int limit);
}
