package com.example.backend.services;

import com.example.backend.dto.review.*;
import com.example.backend.repositories.AdminReviewRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.io.*;
import java.nio.file.*;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class ReviewExcelExporter {
    private final AdminReviewService reviews;
    private final AdminReviewRepository repository;
    private final Clock statisticsClock;
    @Value("${app.admin.reviews.max-export-rows:50000}") private int maxRows;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    public record ExportFile(Path path, String filename) implements AutoCloseable {
        @Override public void close() throws IOException { Files.deleteIfExists(path); }
    }

    /** Repeatable-read keeps batched rows consistent while reviews are deleted or edited. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ExportFile create(AdminReviewFilter request) throws IOException {
        var filter = reviews.filter(request);
        long count = repository.count(filter);
        if (count == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong co danh gia phu hop de xuat");
        if (count > Math.min(maxRows, 1_048_575)) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                "Qua nhieu danh gia. Vui long thu hep bo loc de xuat");
        Path file = Files.createTempFile("stationery-reviews-", ".xlsx");
        boolean success = false;
        try {
            try (SXSSFWorkbook book = new SXSSFWorkbook(100)) {
                book.setCompressTempFiles(true);
                Sheet sheet = book.createSheet("Đánh giá");
                String[] columns = {"Mã đánh giá", "Tên sản phẩm", "Người đánh giá", "Tên đăng nhập", "Số sao", "Nội dung đánh giá", "Ngày đánh giá", "URL hình ảnh đánh giá"};
                int[] widths = {15, 38, 28, 22, 10, 70, 23, 60};
                CellStyle header = book.createCellStyle();
                header.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
                header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                Font font = book.createFont(); font.setBold(true); font.setColor(IndexedColors.WHITE.getIndex()); header.setFont(font);
                CellStyle body = book.createCellStyle(); body.setWrapText(true); body.setVerticalAlignment(VerticalAlignment.TOP);
                Row row = sheet.createRow(0); row.setHeightInPoints(28);
                for (int i = 0; i < columns.length; i++) { Cell cell = row.createCell(i); cell.setCellValue(columns[i]); cell.setCellStyle(header); sheet.setColumnWidth(i, widths[i] * 256); }
                int index = 1;
                for (int offset = 0; offset < count; offset += 500) {
                    List<AdminReviewRow> batch = repository.find(filter, offset, 500);
                    var images = repository.images(batch.stream().map(AdminReviewRow::reviewID).toList());
                    for (var review : batch) {
                        row = sheet.createRow(index++); row.setHeightInPoints(48);
                        String[] values = {String.valueOf(review.reviewID()), review.productTitle(),
                                review.fullName() == null ? review.username() : review.fullName(), review.username(), null,
                                review.comment(), review.reviewDate() == null ? "" : DATE.format(review.reviewDate()),
                                images.getOrDefault(review.reviewID(), List.of()).stream().map(ReviewImageResponse::imageUrl).collect(Collectors.joining("\n"))};
                        for (int i = 0; i < values.length; i++) {
                            Cell cell = row.createCell(i); cell.setCellStyle(body);
                            if (i == 4) cell.setCellValue(review.rating());
                            // All user text is explicitly STRING: never use setCellFormula.
                            else cell.setCellValue(values[i] == null ? "" : values[i]);
                        }
                    }
                }
                sheet.createFreezePane(0, 1);
                sheet.setAutoFilter(new CellRangeAddress(0, index - 1, 0, columns.length - 1));
                try (OutputStream output = Files.newOutputStream(file)) { book.write(output); }
            }
            success = true;
            return new ExportFile(file, "stationery-reviews-" + LocalDate.now(statisticsClock) + ".xlsx");
        } finally { if (!success) Files.deleteIfExists(file); }
    }
}
