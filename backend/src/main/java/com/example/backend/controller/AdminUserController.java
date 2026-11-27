package com.example.backend.controller;

import com.example.backend.dto.user.*;
import com.example.backend.repositories.AdminUserRepository;
import com.example.backend.services.*;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import com.example.backend.dto.PageResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.nio.file.Files;

@RestController @RequestMapping("/api/admin/users") @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {
    private final AdminUserService service;
    private final UserExcelExporter exporter;
    @ModelAttribute void noStore(HttpServletResponse response){response.setHeader("Cache-Control","no-store");}
    @GetMapping public PageResponse<AdminUserRow> list(@ModelAttribute AdminUserFilter filter,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="10")int size){return PageResponse.from(service.list(filter,page,size));}
    @GetMapping("/statistics") public AdminUserRepository.Statistics statistics(@ModelAttribute AdminUserFilter filter){return service.statistics(filter);}
    @PatchMapping("/{id}") public AdminUserRow change(@PathVariable Long id,@Valid @RequestBody AdminUserChange request){return service.change(id,request);}
    @GetMapping("/export") public void export(@ModelAttribute AdminUserFilter filter,HttpServletResponse response)throws IOException {
        try(var file=exporter.create(filter)){
            response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            response.setHeader("Content-Disposition","attachment; filename=\""+file.filename()+"\"");response.setHeader("Cache-Control","no-store");
            response.setContentLengthLong(Files.size(file.path()));Files.copy(file.path(),response.getOutputStream());
        }
    }
}
