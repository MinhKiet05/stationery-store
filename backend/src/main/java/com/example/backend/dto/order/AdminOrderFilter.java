package com.example.backend.dto.order;
import com.example.backend.model.OrderStatus;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;
public record AdminOrderFilter(String search, OrderStatus status, Boolean paid,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate, Sort sort) {
    public enum Sort { NEWEST, OLDEST }
}
