package com.example.backend.services.impl;

import com.example.backend.dto.statistics.*;
import com.example.backend.model.OrderStatus;
import com.example.backend.model.ReturnStatus;
import com.example.backend.repositories.StatisticsRepository;
import com.example.backend.services.StatisticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@PreAuthorize("hasRole('ADMIN')")
public class StatisticsServiceImpl implements StatisticsService {

    private final StatisticsRepository statisticsRepository;
    private final Clock statisticsClock;

    @Override
    public StatisticsOverviewResponse getOverview(StatisticsDateRequest request) {
        DateRange range = dateRange(request);
        var sales = statisticsRepository.findSalesTotals(range.start(), range.end());
        var customers = statisticsRepository.findCustomerTotals();
        return new StatisticsOverviewResponse(range.startDate(), range.endDate(),
                statisticsRepository.countOrders(range.start(), range.end()), sales.getOrderCount(),
                sales.getRevenue(), sales.getDiscount(), statisticsRepository.sumQuantitySold(range.start(), range.end()),
                customers.getTotalCustomers(), statisticsRepository.countNewCustomers(range.start(), range.end()));
    }

    @Override
    public StatisticsRevenueResponse getRevenue(StatisticsDateRequest request, StatisticsGroupBy groupBy) {
        DateRange range = dateRange(request);
        if (groupBy == null) {
            throw badRequest("groupBy must be DAY, MONTH or YEAR");
        }
        List<StatisticsRepository.RevenueRow> rows = switch (groupBy) {
            case DAY -> statisticsRepository.findDailyRevenue(range.start(), range.end());
            case MONTH -> statisticsRepository.findMonthlyRevenue(range.start(), range.end());
            case YEAR -> statisticsRepository.findYearlyRevenue(range.start(), range.end());
        };
        List<RevenuePeriodResponse> periods = rows.stream()
                .map(row -> new RevenuePeriodResponse(LocalDate.of(row.getYear(), row.getMonth(), row.getDay()),
                        row.getOrderCount(), row.getRevenue(), row.getDiscount()))
                .toList();
        BigDecimal total = periods.stream().map(RevenuePeriodResponse::totalRevenue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal discount = periods.stream().map(RevenuePeriodResponse::totalDiscount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long successfulOrders = periods.stream().mapToLong(RevenuePeriodResponse::orderCount).sum();
        return new StatisticsRevenueResponse(range.startDate(), range.endDate(), groupBy,
                successfulOrders, total, discount, periods);
    }

    @Override
    public List<TopProductResponse> getTopProducts(StatisticsDateRequest request, Long productTypeID,
            ProductRanking sortBy, int limit) {
        DateRange range = dateRange(request);
        validateLimit(limit);
        if (productTypeID != null && productTypeID < 1) {
            throw badRequest("productTypeID must be positive");
        }
        if (sortBy == null) {
            throw badRequest("sortBy must be QUANTITY or REVENUE");
        }
        Sort sort = Sort.by(Sort.Direction.DESC, sortBy == ProductRanking.QUANTITY ? "quantitySold" : "revenue")
                .and(Sort.by("productID"));
        return statisticsRepository.findTopProducts(range.start(), range.end(), productTypeID,
                        PageRequest.of(0, limit, sort)).stream()
                .map(row -> new TopProductResponse(row.getProductID(), row.getTitle(),
                        row.getQuantitySold(), row.getRevenue())).toList();
    }

    @Override
    public StatisticsOrdersResponse getOrderStatistics(StatisticsDateRequest request) {
        DateRange range = dateRange(request);
        Map<OrderStatus, Long> statuses = new EnumMap<>(OrderStatus.class);
        for (OrderStatus status : OrderStatus.values()) {
            statuses.put(status, 0L);
        }
        statisticsRepository.countOrdersByStatus(range.start(), range.end())
                .forEach(row -> statuses.put(row.getStatus(), row.getCount()));
        Map<ReturnStatus, Long> returns = new EnumMap<>(ReturnStatus.class);
        for (ReturnStatus status : ReturnStatus.values()) {
            returns.put(status, 0L);
        }
        statisticsRepository.countReturnRequestsByStatus(range.start(), range.end())
                .forEach(row -> returns.put(row.getStatus(), row.getCount()));
        long totalOrders = statuses.values().stream().mapToLong(Long::longValue).sum();
        return new StatisticsOrdersResponse(range.startDate(), range.endDate(), totalOrders, statuses, returns);
    }

    @Override
    public StatisticsCustomersResponse getCustomerStatistics(StatisticsDateRequest request,
            CustomerRanking sortBy, int limit) {
        DateRange range = dateRange(request);
        validateLimit(limit);
        if (sortBy == null) {
            throw badRequest("sortBy must be REVENUE or ORDERS");
        }
        Sort sort = Sort.by(Sort.Direction.DESC, sortBy == CustomerRanking.REVENUE ? "totalPaid" : "orderCount")
                .and(Sort.by("userID"));
        List<TopCustomerResponse> topCustomers = statisticsRepository.findTopCustomers(range.start(), range.end(),
                        PageRequest.of(0, limit, sort)).stream()
                .map(row -> new TopCustomerResponse(row.getUserID(), row.getUsername(), row.getFullName(),
                        row.getOrderCount(), row.getTotalPaid())).toList();
        var customers = statisticsRepository.findCustomerTotals();
        var sales = statisticsRepository.findSalesTotals(range.start(), range.end());
        return new StatisticsCustomersResponse(range.startDate(), range.endDate(),
                customers.getTotalCustomers(), customers.getActiveCustomers(),
                customers.getTotalCustomers() - customers.getActiveCustomers(),
                statisticsRepository.countNewCustomers(range.start(), range.end()), sales.getPurchasingCustomers(),
                sortBy, topCustomers);
    }

    private DateRange dateRange(StatisticsDateRequest request) {
        if (request == null) {
            throw badRequest("Statistics date filter is required");
        }
        LocalDate startDate = request.startDate();
        LocalDate endDate = request.endDate();
        if (startDate == null && endDate == null) {
            LocalDate today = LocalDate.now(statisticsClock);
            startDate = today.withDayOfMonth(1);
            endDate = today.withDayOfMonth(today.lengthOfMonth());
        } else if (startDate == null || endDate == null) {
            throw badRequest("Vui lòng chọn cả ngày bắt đầu và ngày kết thúc");
        }
        if (startDate != null && (startDate.getYear() < 1 || startDate.getYear() > 9999)) {
            throw badRequest("startDate must be within years 0001 to 9999");
        }
        if (endDate != null && (endDate.getYear() < 1 || !endDate.isBefore(LocalDate.of(9999, 12, 31)))) {
            throw badRequest("endDate must be between 0001-01-01 and 9999-12-30");
        }
        if (startDate != null && endDate != null && startDate.isAfter(endDate)) {
            throw badRequest("Khoảng thời gian không hợp lệ");
        }
        return new DateRange(startDate, endDate, startDate.atStartOfDay(), endDate.plusDays(1).atStartOfDay());
    }

    private void validateLimit(int limit) {
        if (limit < 1 || limit > 100) {
            throw badRequest("limit must be between 1 and 100");
        }
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record DateRange(LocalDate startDate, LocalDate endDate, LocalDateTime start, LocalDateTime end) {
    }
}
