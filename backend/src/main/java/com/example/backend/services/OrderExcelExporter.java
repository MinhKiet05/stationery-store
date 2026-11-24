package com.example.backend.services;

import com.example.backend.dto.order.AdminOrderFilter;
import com.example.backend.repositories.AdminOrderRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.*;
import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeFormatter;

@Service
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class OrderExcelExporter {
    private final AdminOrderService service;
    private final AdminOrderRepository repository;
    private final Clock statisticsClock;
    @Value("${app.admin.orders.max-export-rows:50000}") private int maxRows;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReviewExcelExporter.ExportFile create(AdminOrderFilter request) throws IOException {
        var filter = service.filter(request); long count = repository.count(filter);
        if (count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong co don hang phu hop de xuat");
        if (count > Math.min(maxRows, 1_048_575)) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Vui long thu hep bo loc de xuat");
        Path file = Files.createTempFile("stationery-orders-", ".xlsx"); boolean success = false;
        try {
            try (SXSSFWorkbook book = new SXSSFWorkbook(100)) {
                book.setCompressTempFiles(true); Sheet sheet = book.createSheet("Đơn hàng");
                String[] columns = {"Mã đơn hàng", "Khách hàng", "Ngày đặt", "Trạng thái đơn hàng", "Phương thức thanh toán", "Trạng thái thanh toán", "Tạm tính", "Giảm giá", "Tổng tiền"};
                int[] widths = {20, 30, 24, 24, 26, 26, 23, 23, 23};
                CellStyle header = book.createCellStyle(); header.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex()); header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                Font font = book.createFont(); font.setBold(true); font.setColor(IndexedColors.WHITE.getIndex()); header.setFont(font);
                CellStyle body = book.createCellStyle(); body.setWrapText(true); body.setVerticalAlignment(VerticalAlignment.TOP);
                CellStyle money = book.createCellStyle(); money.setDataFormat(book.createDataFormat().getFormat("#,##0 \"₫\""));
                Row row = sheet.createRow(0); row.setHeightInPoints(28);
                for (int i = 0; i < columns.length; i++) { Cell cell = row.createCell(i); cell.setCellValue(columns[i]); cell.setCellStyle(header); sheet.setColumnWidth(i, widths[i] * 256); }
                int index = 1;
                for (int offset = 0; offset < count; offset += 500) {
                    for (var r : repository.find(filter, offset, 500)) {
                        row = sheet.createRow(index++); row.setHeightInPoints(48);
                        String status = switch (r.status()) { case PENDING -> "Chờ xác nhận"; case PROCESSING -> "Đang xử lý"; case SHIPPED -> "Đang giao"; case DELIVERED -> "Đã giao"; case CANCELLED -> "Đã hủy"; case RETURN_PENDING -> "Chờ trả hàng"; };
                        String[] values = {"ORD-" + r.orderID(), r.customerName() == null ? r.username() : r.customerName(),
                                r.orderDate() == null ? "" : DATE.format(r.orderDate()), status, r.paymentMethod(),
                                r.isPaid() == null ? "Chưa có thông tin" : r.isPaid() ? "Đã thanh toán" : "Chưa thanh toán"};
                        for (int i = 0; i < values.length; i++) {
                            Cell cell = row.createCell(i); cell.setCellStyle(body);
                            // Explicit STRING cells prevent formulas from customer-controlled values.
                            cell.setCellValue(values[i] == null ? "" : values[i]);
                        }
                        java.math.BigDecimal[] amounts = {r.subTotal(), r.discountAmount(), r.totalAmount()};
                        for (int i = 0; i < amounts.length; i++) {
                            Cell cell = row.createCell(6 + i); cell.setCellStyle(money);
                            if (amounts[i] != null) cell.setCellValue(amounts[i].doubleValue());
                        }
                    }
                }
                sheet.createFreezePane(0, 1); sheet.setAutoFilter(new CellRangeAddress(0, index - 1, 0, columns.length - 1));
                try (OutputStream output = Files.newOutputStream(file)) { book.write(output); }
            }
            success = true;
            return new ReviewExcelExporter.ExportFile(file, "stationery-orders-" + LocalDate.now(statisticsClock) + ".xlsx");
        } finally { if (!success) Files.deleteIfExists(file); }
    }
}
