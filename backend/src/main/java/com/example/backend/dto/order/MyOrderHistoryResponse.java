package com.example.backend.dto.order;
import com.example.backend.model.OrderStatus;
import java.util.*;
public record MyOrderHistoryResponse(List<OrderResponse> content, long totalElements, int totalPages, Map<OrderStatus,Long> statusCounts) {}
