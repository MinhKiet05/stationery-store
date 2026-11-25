package com.example.backend.services;
import com.example.backend.dto.product.*;
import com.example.backend.repositories.AdminProductRepository;
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
@Service @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class ProductExcelExporter {
    private final AdminProductService service;
    private final AdminProductRepository repository;
    private final Clock statisticsClock;
    @Value("${app.admin.products.max-export-rows:50000}") private int maxRows;
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ReviewExcelExporter.ExportFile create(AdminProductFilter request) throws IOException {
        var f=service.filter(request);long count=repository.count(f),variants=repository.exportVariantCount(f);
        if(count==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Khong co san pham phu hop");
        if(Math.max(count,variants)>Math.min(maxRows,1_048_575))throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Vui long thu hep bo loc");
        Path file=Files.createTempFile("stationery-products-",".xlsx");boolean saved=false;
        try {
            try(var book=new SXSSFWorkbook(100)) {
                book.setCompressTempFiles(true);
                var header=book.createCellStyle();var font=book.createFont();font.setBold(true);header.setFont(font);
                header.setFillForegroundColor(IndexedColors.LIGHT_CORNFLOWER_BLUE.getIndex());header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                var money=book.createCellStyle();money.setDataFormat(book.createDataFormat().getFormat("#,##0 \"₫\""));
                var products=sheet(book,"Sản phẩm",new String[]{"ID sản phẩm","Tên sản phẩm","Danh mục","Thương hiệu","Giá thấp nhất","Giá cao nhất","Tổng tồn kho","Số biến thể","Trạng thái"},header);
                int index=1;
                for(int offset=0;offset<count;offset+=500)for(var p:repository.find(f,offset,500)) {
                    var row=products.createRow(index++);text(row,0,p.productID());text(row,1,p.title());text(row,2,p.productTypeName());text(row,3,p.vendorName());
                    price(row,4,p.priceMin(),money);price(row,5,p.priceMax(),money);number(row,6,p.totalStock());number(row,7,p.variantCount());
                    text(row,8,!Boolean.TRUE.equals(p.isActive())?"Đã xóa mềm":Boolean.TRUE.equals(p.available())?"Đang kinh doanh":"Đang ẩn");
                }
                products.setAutoFilter(new CellRangeAddress(0,index-1,0,8));
                var detail=sheet(book,"Biến thể",new String[]{"ID sản phẩm","Tên sản phẩm","ID biến thể","Tên biến thể","SKU","Giá bán","Giá gốc","Tồn kho","Cho phép bán","Thuộc tính 1","Thuộc tính 2","Thuộc tính 3"},header);
                index=1;
                for(int offset=0;offset<variants;offset+=500)for(var v:repository.exportVariants(f,offset,500)) {
                    var row=detail.createRow(index++);text(row,0,v.productID());text(row,1,v.productTitle());text(row,2,v.variantID());text(row,3,v.title());text(row,4,v.sku());
                    price(row,5,v.price(),money);price(row,6,v.compareAtPrice(),money);number(row,7,v.stockQuantity());text(row,8,Boolean.TRUE.equals(v.available())?"Có":"Không");text(row,9,v.option1());text(row,10,v.option2());text(row,11,v.option3());
                }
                detail.setAutoFilter(new CellRangeAddress(0,Math.max(0,index-1),0,11));
                try(var out=Files.newOutputStream(file)){book.write(out);}
            }
            saved=true;return new ReviewExcelExporter.ExportFile(file,"stationery-products-"+LocalDate.now(statisticsClock)+".xlsx");
        }finally{if(!saved)Files.deleteIfExists(file);}
    }
    private Sheet sheet(Workbook book,String name,String[] titles,CellStyle style){var s=book.createSheet(name);var row=s.createRow(0);for(int i=0;i<titles.length;i++){var c=row.createCell(i);c.setCellValue(titles[i]);c.setCellStyle(style);s.setColumnWidth(i,(i==1?45:25)*256);}s.createFreezePane(0,1);return s;}
    private void text(Row row,int i,Object value){row.createCell(i).setCellValue(value==null?"":value.toString());}
    private void number(Row row,int i,Number value){if(value!=null)row.createCell(i).setCellValue(value.doubleValue());}
    private void price(Row row,int i,java.math.BigDecimal value,CellStyle style){var c=row.createCell(i);c.setCellStyle(style);if(value!=null)c.setCellValue(value.doubleValue());}
}
