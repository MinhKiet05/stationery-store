package com.example.backend.dto.returns;

public record ReturnStatisticsResponse(long totalRequests, long pendingRequests, long approvedRequests, long rejectedRequests) {}
