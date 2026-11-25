package com.example.backend.controller;
import com.example.backend.dto.product.*;
import com.example.backend.dto.productvariant.ProductVariantResponse;
import com.example.backend.services.*;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.nio.file.Files;
@RestController @RequestMapping("/api/admin/products") @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class AdminProductController {
    private final AdminProductService service;
    private final ProductExcelExporter exporter;
    @GetMapping public Page<AdminProductRow> list(@ModelAttribute AdminProductFilter filter,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="10")int size){return service.list(filter,page,size);}
    @GetMapping("/statistics") public AdminProductDetail.Statistics statistics(@ModelAttribute AdminProductFilter filter){return service.statistics(filter);}
    @GetMapping("/options") public AdminProductDetail.Options options(){return service.options();}
    @GetMapping("/{id}") public AdminProductDetail detail(@PathVariable Long id){return service.detail(id);}
    @PostMapping @ResponseStatus(org.springframework.http.HttpStatus.CREATED) public AdminProductDetail create(@RequestBody AdminProductDetail.Write body){return service.create(body);}
    @PutMapping("/{id}") public AdminProductDetail update(@PathVariable Long id,@RequestBody AdminProductDetail.Write body){return service.update(id,body);}
    @PatchMapping("/{id}/status") public AdminProductDetail status(@PathVariable Long id,@RequestBody AdminProductDetail.Status body){return service.status(id,body);}
    @DeleteMapping("/{id}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT) public void delete(@PathVariable Long id,@RequestBody AdminProductDetail.Status body){service.delete(id,body.expectedState());}
    @PostMapping("/{id}/variants") @ResponseStatus(org.springframework.http.HttpStatus.CREATED) public ProductVariantResponse createVariant(@PathVariable Long id,@RequestBody AdminProductDetail.VariantWrite body){return service.createVariant(id,body);}
    @PutMapping("/{id}/variants/{variantID}") public ProductVariantResponse updateVariant(@PathVariable Long id,@PathVariable Long variantID,@RequestBody AdminProductDetail.VariantWrite body){return service.updateVariant(id,variantID,body);}
    @GetMapping("/export") public void export(@ModelAttribute AdminProductFilter filter,HttpServletResponse response)throws IOException {
        try(var file=exporter.create(filter)){response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");response.setHeader("Content-Disposition","attachment; filename=\""+file.filename()+"\"");response.setHeader("Cache-Control","no-store");response.setContentLengthLong(Files.size(file.path()));Files.copy(file.path(),response.getOutputStream());}
    }
}
