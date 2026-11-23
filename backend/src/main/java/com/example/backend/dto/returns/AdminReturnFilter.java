package com.example.backend.dto.returns;

import com.example.backend.model.ReturnStatus;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;

public record AdminReturnFilter(String search, ReturnStatus status,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate, Sort sort) {
    public enum Sort { NEWEST, OLDEST }
}
