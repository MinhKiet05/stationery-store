package com.example.backend.services;

import com.example.backend.dto.order.*;
import com.example.backend.repositories.AdminOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminOrderService {
    private final AdminOrderRepository repository;
    public Page<AdminOrderRow> list(AdminOrderFilter request, int page, int size) {
        if (page < 0 || size < 1 || size > 50 || (long) page * size > Integer.MAX_VALUE) throw bad();
        var f = filter(request); long count = repository.count(f);
        return new PageImpl<>(repository.find(f, page * size, size), PageRequest.of(page, size), count);
    }
    public OrderStatisticsResponse statistics(AdminOrderFilter request) { return repository.statistics(filter(request)); }
    public AdminOrderRepository.Filter filter(AdminOrderFilter f) {
        String search = f.search() == null ? "" : f.search().strip();
        if (search.length() > 150 || (f.startDate() != null && (f.startDate().getYear() < 1 || f.startDate().getYear() > 9998))
                || (f.endDate() != null && (f.endDate().getYear() < 1 || f.endDate().getYear() > 9998))
                || (f.startDate() != null && f.endDate() != null && f.startDate().isAfter(f.endDate()))) throw bad();
        if (search.startsWith("#")) search = search.substring(1);
        String pattern = search.isEmpty() ? null : "%" + search.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        return new AdminOrderRepository.Filter(pattern, f.status(), f.startDate() == null ? null : f.startDate().atStartOfDay(),
                f.endDate() == null ? null : f.endDate().plusDays(1).atStartOfDay(), f.paid(), f.sort() == AdminOrderFilter.Sort.OLDEST);
    }
    private ResponseStatusException bad() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bo loc don hang khong hop le"); }
}
