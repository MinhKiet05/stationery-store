package com.example.backend.controller;

import com.example.backend.dto.coupon.AdminCouponFilter;
import com.example.backend.services.*;
import com.example.backend.repositories.AdminCouponRepository;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.nio.file.Files;

/** New queries only; detail/create/update/soft-deactivate reuse /api/coupons. */
@RestController
@RequestMapping("/api/admin/promotions")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminPromotionController {
    private final AdminCouponService service;
    private final CouponExcelExporter exporter;
    @GetMapping public AdminCouponService.Page list(@Valid @ModelAttribute AdminCouponFilter filter,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) { return service.list(filter, page, size); }
    @GetMapping("/statistics") public AdminCouponRepository.Statistics statistics(@Valid @ModelAttribute AdminCouponFilter filter) { return service.statistics(filter); }
    @GetMapping("/export") public void export(@Valid @ModelAttribute AdminCouponFilter filter, HttpServletResponse response) throws IOException {
        try (var file = exporter.create(filter)) {
            response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.filename() + "\"");
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store"); response.setContentLengthLong(Files.size(file.path()));
            Files.copy(file.path(), response.getOutputStream());
        }
    }
}
