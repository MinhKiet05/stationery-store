package com.example.backend.controller;
import com.example.backend.dto.order.*;
import com.example.backend.services.AdminOrderService;
import com.example.backend.services.OrderExcelExporter;
import com.example.backend.services.OrderService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.example.backend.dto.PageResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;

@RestController
@RequestMapping("/api/admin/orders")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminOrderController {
    private final OrderService service;
    private final AdminOrderService queries;
    private final OrderExcelExporter exporter;
    @GetMapping(params = "page")
    public PageResponse<AdminOrderRow> list(@ModelAttribute AdminOrderFilter filter,
            @RequestParam int page, @RequestParam(defaultValue = "10") int size) { return PageResponse.from(queries.list(filter, page, size)); }
    @GetMapping("/statistics")
    public OrderStatisticsResponse statistics(@ModelAttribute AdminOrderFilter filter) { return queries.statistics(filter); }
    @GetMapping("/export")
    public void export(@ModelAttribute AdminOrderFilter filter, HttpServletResponse response) throws IOException {
        try (var file = exporter.create(filter)) {
            response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            response.setHeader("Content-Disposition", "attachment; filename=\"" + file.filename() + "\"");
            response.setHeader("Cache-Control", "no-store"); response.setContentLengthLong(Files.size(file.path()));
            Files.copy(file.path(), response.getOutputStream());
        }
    }
    // Keep the original array contract for callers that do not request pagination.
    @GetMapping(params = "!page")
    public List<OrderResponse> all() { return service.adminOrders(); }
    @GetMapping("/{id}")
    public AdminOrderDetailResponse detail(@PathVariable Long id) { return service.adminOrder(id); }
    @PatchMapping("/{id}/status")
    public OrderResponse status(@PathVariable Long id, @Valid @RequestBody UpdateOrderStatusRequest request) {
        return service.adminChangeStatus(id, request);
    }
}
