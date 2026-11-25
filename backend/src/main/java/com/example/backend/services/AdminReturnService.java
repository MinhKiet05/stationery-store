package com.example.backend.services;

import com.example.backend.dto.returns.*;
import com.example.backend.repositories.AdminReturnRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@PreAuthorize("hasRole('ADMIN')")
public class AdminReturnService {
    private final AdminReturnRepository repository;
    public Page<AdminReturnRow> list(AdminReturnFilter request, int page, int size) {
        if (page < 0 || size < 1 || size > 50 || (long) page * size > Integer.MAX_VALUE) throw bad();
        var f = filter(request); long count = repository.count(f);
        return new PageImpl<>(repository.find(f, page * size, size), PageRequest.of(page, size), count);
    }
    public ReturnStatisticsResponse statistics(AdminReturnFilter request) { return repository.statistics(filter(request)); }
    public AdminReturnDetailResponse detail(Long id) {
        var row = repository.detail(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Yeu cau tra hang khong ton tai"));
        String evidence = repository.evidence(id);
        List<String> urls = evidence == null ? List.of() : Arrays.stream(evidence.split("\\R")).map(String::strip)
                .filter(this::safeEvidence).toList();
        return new AdminReturnDetailResponse(row, repository.order(id), repository.items(id), urls, repository.receipt(id));
    }
    private boolean safeEvidence(String value) {
        try { URI uri = URI.create(value); return uri.getHost() != null && uri.getUserInfo() == null
                && ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())); }
        catch (IllegalArgumentException invalid) { return false; }
    }
    public AdminReturnRepository.Filter filter(AdminReturnFilter f) {
        String search = f.search() == null ? "" : f.search().strip();
        if (search.length() > 150 || (f.startDate() != null && (f.startDate().getYear() < 1 || f.startDate().getYear() > 9998))
                || (f.endDate() != null && (f.endDate().getYear() < 1 || f.endDate().getYear() > 9998))
                || (f.startDate() != null && f.endDate() != null && f.startDate().isAfter(f.endDate()))) throw bad();
        if (search.startsWith("#")) search = search.substring(1);
        String pattern = search.isEmpty() ? null : "%" + search.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        return new AdminReturnRepository.Filter(pattern, f.status(), f.startDate() == null ? null : f.startDate().atStartOfDay(),
                f.endDate() == null ? null : f.endDate().plusDays(1).atStartOfDay(), f.sort() == AdminReturnFilter.Sort.OLDEST);
    }
    private ResponseStatusException bad() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bo loc tra hang khong hop le"); }
}
