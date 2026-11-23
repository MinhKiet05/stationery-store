package com.example.backend.controller;

import com.example.backend.dto.returns.ReturnResponse;
import com.example.backend.dto.returns.UpdateReturnStatusRequest;
import com.example.backend.dto.returns.AdminReturnFilter;
import com.example.backend.dto.returns.AdminReturnRow;
import com.example.backend.dto.returns.AdminReturnDetailResponse;
import com.example.backend.dto.returns.ReturnStatisticsResponse;
import com.example.backend.services.AdminReturnService;
import com.example.backend.services.ReturnExcelExporter;
import com.example.backend.services.ReturnRequestService;
import com.example.backend.services.ReturnInventoryService;
import com.example.backend.dto.returns.ReceiveReturnRequest;
import com.example.backend.dto.returns.RestockReturnRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import java.io.IOException;
import java.nio.file.Files;

@RestController
@RequestMapping("/api/admin/returns")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminReturnRequestController {
    private final ReturnRequestService service;
    private final AdminReturnService queries;
    private final ReturnExcelExporter exporter;
    private final ReturnInventoryService inventory;

    @GetMapping(params = "!page")
    public List<ReturnResponse> all() { return service.all(); }

    // Pagination is opt-in, preserving the original array contract for existing clients.
    @GetMapping(params = "page")
    public Page<AdminReturnRow> list(@ModelAttribute AdminReturnFilter filter,
            @RequestParam int page, @RequestParam(defaultValue = "10") int size) { return queries.list(filter, page, size); }

    @GetMapping("/statistics")
    public ReturnStatisticsResponse statistics(@ModelAttribute AdminReturnFilter filter) { return queries.statistics(filter); }

    @GetMapping("/{id}")
    public AdminReturnDetailResponse detail(@PathVariable Long id) { return queries.detail(id); }

    @GetMapping("/export")
    public void export(@ModelAttribute AdminReturnFilter filter, HttpServletResponse response) throws IOException {
        try (var file = exporter.create(filter)) {
            response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + file.filename() + "\"");
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store"); response.setContentLengthLong(Files.size(file.path()));
            Files.copy(file.path(), response.getOutputStream());
        }
    }

    @PatchMapping("/{id}/status")
    public ReturnResponse status(@PathVariable Long id, @Valid @RequestBody UpdateReturnStatusRequest request) {
        return service.changeStatus(id, request);
    }

    @PostMapping("/{id}/receive")
    public AdminReturnDetailResponse receive(@PathVariable Long id, @Valid @RequestBody ReceiveReturnRequest request) { return inventory.receive(id, request); }

    @PostMapping("/{id}/restock")
    public AdminReturnDetailResponse restock(@PathVariable Long id, @Valid @RequestBody RestockReturnRequest request) { return inventory.restock(id, request); }
}
