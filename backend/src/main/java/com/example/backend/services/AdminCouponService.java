package com.example.backend.services;

import com.example.backend.dto.coupon.*;
import com.example.backend.repositories.AdminCouponRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminCouponService {
    private final AdminCouponRepository repository;
    public AdminCouponRepository.Filter filter(AdminCouponFilter f) {
        String search = f.search() == null ? "" : f.search().trim().toUpperCase(Locale.ROOT);
        String pattern = search.isEmpty() ? null : "%" + search.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        // Use the same server date as CouponServiceImpl.validate and OrderServiceImpl.placeOrder.
        return new AdminCouponRepository.Filter(pattern, f.status() == null ? null : f.status().name(), f.discountType(),
                f.sort() == null ? AdminCouponFilter.Sort.ID_DESC : f.sort(), LocalDate.now());
    }
    public record Page(List<CouponResponse> content, long totalElements, int totalPages, int number, int size) {}
    public Page list(AdminCouponFilter request, int page, int size) {
        if (page < 0 || page > 1_000_000 || size < 1 || size > 50) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phan trang khong hop le");
        var f = filter(request); long count = repository.count(f);
        return new Page(repository.find(f, page * size, size), count, (int) ((count + size - 1) / size), page, size);
    }
    public AdminCouponRepository.Statistics statistics(AdminCouponFilter request) { return repository.statistics(filter(request)); }
}
