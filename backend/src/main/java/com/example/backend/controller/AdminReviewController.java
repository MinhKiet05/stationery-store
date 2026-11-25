package com.example.backend.controller;

import com.example.backend.dto.review.*;
import com.example.backend.services.*;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.nio.file.Files;

@RestController
@RequestMapping("/api/admin/reviews")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminReviewController {
    private final AdminReviewService service;
    private final ReviewService mutations;
    private final ReviewExcelExporter exporter;

    @GetMapping
    public Page<AdminReviewResponse> list(@ModelAttribute AdminReviewFilter filter,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
        return service.list(filter, page, size);
    }

    @GetMapping("/statistics")
    public ReviewStatisticsResponse statistics(@ModelAttribute AdminReviewFilter filter) { return service.statistics(filter); }

    @GetMapping("/{id}")
    public AdminReviewResponse detail(@PathVariable Long id) { return service.detail(id); }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) { mutations.adminDelete(id); return ResponseEntity.noContent().build(); }

    @GetMapping("/export")
    public void export(@ModelAttribute AdminReviewFilter filter, HttpServletResponse response) throws IOException {
        // Finish generation before committing headers, so errors keep a safe JSON HTTP response.
        try (var file = exporter.create(filter)) {
            response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.filename() + "\"");
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
            response.setContentLengthLong(Files.size(file.path()));
            Files.copy(file.path(), response.getOutputStream());
        }
    }
}
