package com.example.backend.controller;

import com.example.backend.excel.*;
import com.example.backend.services.AdminProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import static com.example.backend.excel.ImportModels.*;

@RestController @RequestMapping("/api/admin/{kind:products|promotions}/import") @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class ExcelImportController {
    private final ExcelCellReader reader;
    private final ExcelTemplateService templates;
    private final ExcelImportService service;
    private final AdminProductService products;
    @GetMapping("/template") public ResponseEntity<byte[]> template(@PathVariable Kind kind)throws IOException{
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"stationery-"+kind+"-import-template.xlsx\"").header(HttpHeaders.CACHE_CONTROL,"no-store").contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).body(templates.create(kind,false,kind==Kind.products?products.options():null));
    }
    @PostMapping(value="/preview",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Preview preview(@PathVariable Kind kind,@RequestPart MultipartFile file,Authentication auth){return service.preview(reader.bytes(file),kind,auth.getName());}
    @PostMapping(value="/confirm",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result confirm(@PathVariable Kind kind,@RequestPart MultipartFile file,@RequestParam String importToken,Authentication auth){return service.confirm(reader.bytes(file),kind,auth.getName(),importToken);}
}
