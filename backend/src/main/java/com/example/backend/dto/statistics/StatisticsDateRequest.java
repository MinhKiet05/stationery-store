package com.example.backend.dto.statistics;

import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

public record StatisticsDateRequest(
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
}
