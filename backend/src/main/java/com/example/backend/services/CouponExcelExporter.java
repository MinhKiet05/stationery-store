package com.example.backend.services;

import com.example.backend.dto.coupon.*;
import com.example.backend.repositories.AdminCouponRepository;
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
import java.util.List;

@Service
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class CouponExcelExporter {
    private final AdminCouponService service;
    private final AdminCouponRepository repository;
    private final Clock statisticsClock;
    @Value("${app.admin.promotions.max-export-rows:50000}") private int maxRows;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReviewExcelExporter.ExportFile create(AdminCouponFilter request) throws IOException {
        var filter = service.filter(request);
        long count = repository.count(filter);
        if (count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong co voucher phu hop de xuat");
        if (count > Math.min(maxRows, 1_048_575)) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Vui long thu hep bo loc de xuat");
        Path file = Files.createTempFile("stationery-promotions-", ".xlsx"); boolean success = false;
        try {
            try (SXSSFWorkbook book = new SXSSFWorkbook(100)) {
                book.setCompressTempFiles(true);
                Sheet sheet = book.createSheet("Khuyến mãi & Voucher");
                String[] headers = {"Mã voucher", "Loại giảm giá", "Giá trị giảm", "Đơn hàng tối thiểu", "Ngày bắt đầu", "Ngày kết thúc", "Trạng thái", "Giới hạn lượt dùng", "Lượt đã dùng", "Kích hoạt"};
                int[] widths = {26, 24, 20, 24, 22, 22, 25, 23, 18, 16};
                CellStyle heading = book.createCellStyle(); heading.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex()); heading.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                Font font = book.createFont(); font.setBold(true); font.setColor(IndexedColors.WHITE.getIndex()); heading.setFont(font);
                CellStyle money = book.createCellStyle(); money.setDataFormat(book.createDataFormat().getFormat("#,##0.00 \"₫\""));
                CellStyle percent = book.createCellStyle(); percent.setDataFormat(book.createDataFormat().getFormat("0.##\"%\""));
                // Domain stores LocalDate only: display dates without inventing a time of day.
                CellStyle date = book.createCellStyle(); date.setDataFormat(book.createDataFormat().getFormat("dd/MM/yyyy"));
                Row header = sheet.createRow(0); header.setHeightInPoints(28);
                for (int i = 0; i < headers.length; i++) { Cell cell = header.createCell(i); cell.setCellValue(headers[i]); cell.setCellStyle(heading); sheet.setColumnWidth(i, widths[i] * 256); }
                int index = 1;
                for (int offset = 0; offset < count; offset += 500) {
                    List<CouponResponse> batch = repository.find(filter, offset, 500);
                    for (var c : batch) {
                        Row row = sheet.createRow(index++);
                        // Explicit string values, never formulas, including legacy codes beginning with '='.
                        row.createCell(0).setCellValue(c.code());
                        boolean percentage = c.discountType() == com.example.backend.model.DiscountType.PERCENTAGE;
                        row.createCell(1).setCellValue(percentage ? "Phần trăm" : "Số tiền cố định");
                        Cell value = row.createCell(2); value.setCellValue(c.discountValue().doubleValue()); value.setCellStyle(percentage ? percent : money);
                        if (c.minOrderValue() != null) { Cell cell = row.createCell(3); cell.setCellValue(c.minOrderValue().doubleValue()); cell.setCellStyle(money); }
                        if (c.startDate() != null) { Cell cell = row.createCell(4); cell.setCellValue(c.startDate().atStartOfDay()); cell.setCellStyle(date); }
                        if (c.endDate() != null) { Cell cell = row.createCell(5); cell.setCellValue(c.endDate().atStartOfDay()); cell.setCellStyle(date); }
                        row.createCell(6).setCellValue(switch (CouponStatus.of(c, filter.today())) {
                            case ACTIVE -> "Đang hoạt động"; case DISABLED -> "Đã vô hiệu hóa"; case EXPIRED -> "Hết hạn"; case NOT_STARTED -> "Chưa bắt đầu"; case EXHAUSTED -> "Hết lượt sử dụng";
                        });
                        if (c.usageLimit() != null) row.createCell(7).setCellValue(c.usageLimit());
                        else row.createCell(7).setCellValue("Không giới hạn");
                        row.createCell(8).setCellValue(c.usedCount() == null ? 0 : c.usedCount());
                        row.createCell(9).setCellValue(Boolean.TRUE.equals(c.isActive()) ? "Có" : "Không");
                    }
                }
                sheet.createFreezePane(0, 1); sheet.setAutoFilter(new CellRangeAddress(0, index - 1, 0, headers.length - 1));
                try (OutputStream output = Files.newOutputStream(file)) { book.write(output); }
            }
            success = true;
            return new ReviewExcelExporter.ExportFile(file, "stationery-promotions-" + LocalDate.now(statisticsClock) + ".xlsx");
        } finally { if (!success) Files.deleteIfExists(file); }
    }
}
