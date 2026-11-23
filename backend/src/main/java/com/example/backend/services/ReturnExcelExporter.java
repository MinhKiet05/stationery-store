package com.example.backend.services;

import com.example.backend.dto.returns.AdminReturnFilter;
import com.example.backend.repositories.AdminReturnRepository;
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
public class ReturnExcelExporter {
    private final AdminReturnService service;
    private final AdminReturnRepository repository;
    private final Clock statisticsClock;
    @Value("${app.admin.returns.max-export-rows:50000}") private int maxRows;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReviewExcelExporter.ExportFile create(AdminReturnFilter request) throws IOException {
        var filter = service.filter(request); long count = repository.count(filter);
        if (count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong co yeu cau phu hop de xuat");
        if (count > Math.min(maxRows, 1_048_575)) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Vui long thu hep bo loc de xuat");
        Path file = Files.createTempFile("stationery-returns-", ".xlsx"); boolean success = false;
        try {
            try (SXSSFWorkbook book = new SXSSFWorkbook(100)) {
                book.setCompressTempFiles(true); Sheet sheet = book.createSheet("Yêu cầu trả hàng");
                String[] columns = {"Mã yêu cầu", "Mã đơn hàng", "Khách hàng", "Tên đăng nhập", "Ngày yêu cầu", "Lý do trả hàng", "Trạng thái yêu cầu", "Ngày xử lý", "Ghi chú xử lý"};
                int[] widths = {20, 20, 28, 24, 24, 65, 24, 24, 65};
                CellStyle header = book.createCellStyle(); header.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex()); header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                Font font = book.createFont(); font.setBold(true); font.setColor(IndexedColors.WHITE.getIndex()); header.setFont(font);
                CellStyle body = book.createCellStyle(); body.setWrapText(true); body.setVerticalAlignment(VerticalAlignment.TOP);
                Row row = sheet.createRow(0); row.setHeightInPoints(28);
                for (int i = 0; i < columns.length; i++) { Cell cell = row.createCell(i); cell.setCellValue(columns[i]); cell.setCellStyle(header); sheet.setColumnWidth(i, widths[i] * 256); }
                int index = 1;
                for (int offset = 0; offset < count; offset += 500) {
                    for (var r : repository.find(filter, offset, 500)) {
                        row = sheet.createRow(index++); row.setHeightInPoints(48);
                        String status = switch (r.status()) { case PENDING -> "Chờ xử lý"; case APPROVED -> "Đã chấp thuận"; case REJECTED -> "Đã từ chối"; case COMPLETED -> "Hoàn tất yêu cầu"; };
                        String[] values = {"RET-" + r.returnID(), "ORD-" + r.orderID(), r.customerName() == null ? r.username() : r.customerName(),
                                r.username(), r.createdAt() == null ? "" : DATE.format(r.createdAt()), r.reason(), status,
                                r.processedAt() == null ? "" : DATE.format(r.processedAt()), r.adminNote()};
                        for (int i = 0; i < values.length; i++) {
                            Cell cell = row.createCell(i); cell.setCellStyle(body);
                            // Explicit STRING cells prevent formulas from customer names, reasons or notes.
                            cell.setCellValue(values[i] == null ? "" : values[i]);
                        }
                    }
                }
                sheet.createFreezePane(0, 1); sheet.setAutoFilter(new CellRangeAddress(0, index - 1, 0, columns.length - 1));
                try (OutputStream output = Files.newOutputStream(file)) { book.write(output); }
            }
            success = true;
            return new ReviewExcelExporter.ExportFile(file, "stationery-returns-" + LocalDate.now(statisticsClock) + ".xlsx");
        } finally { if (!success) Files.deleteIfExists(file); }
    }
}
