package com.example.backend.services;

import com.example.backend.dto.user.AdminUserFilter;
import com.example.backend.repositories.AdminUserRepository;
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

@Service @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class UserExcelExporter {
    private final AdminUserService service;
    private final AdminUserRepository repository;
    private final Clock statisticsClock;
    @Value("${app.admin.users.max-export-rows:50000}") private int maxRows;
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ReviewExcelExporter.ExportFile create(AdminUserFilter request)throws IOException {
        var filter=service.filter(request);long count=repository.count(filter);
        if(count==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Khong co tai khoan phu hop de xuat");
        if(count>Math.min(maxRows,1_048_575))throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Vui long thu hep bo loc de xuat");
        Path file=Files.createTempFile("stationery-users-",".xlsx");boolean success=false;
        try {
            try(SXSSFWorkbook book=new SXSSFWorkbook(100)) {
                book.setCompressTempFiles(true);Sheet sheet=book.createSheet("Người dùng");
                String[] headers={"ID người dùng","Tên đăng nhập","Họ tên","Email","Số điện thoại","Vai trò","Trạng thái","Ngày đăng ký"};
                var header=book.createCellStyle();header.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
                var font=book.createFont();font.setBold(true);font.setColor(IndexedColors.WHITE.getIndex());header.setFont(font);
                Row row=sheet.createRow(0);
                for(int c=0;c<headers.length;c++){var cell=row.createCell(c);cell.setCellValue(headers[c]);cell.setCellStyle(header);sheet.setColumnWidth(c,(c==3?42:26)*256);}
                int index=1;
                for(int offset=0;offset<count;offset+=500)for(var u:repository.find(filter,offset,500)){
                    row=sheet.createRow(index++);
                    String[] values={"USR-"+u.userID(),u.username(),u.fullName(),u.email(),u.phoneNumber(),u.role().name(),Boolean.TRUE.equals(u.isActive())?"Đang hoạt động":"Bị khóa",u.createdAt()==null?null:u.createdAt().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))};
                    // Explicit STRING cells preserve phone numbers and never execute formulas.
                    for(int c=0;c<values.length;c++)row.createCell(c,CellType.STRING).setCellValue(values[c]==null?"":values[c]);
                }
                sheet.createFreezePane(0,1);sheet.setAutoFilter(new CellRangeAddress(0,index-1,0,headers.length-1));
                try(var output=Files.newOutputStream(file)){book.write(output);}
            }
            success=true;return new ReviewExcelExporter.ExportFile(file,"stationery-users-"+LocalDate.now(statisticsClock)+".xlsx");
        }finally{if(!success)Files.deleteIfExists(file);}
    }
}
