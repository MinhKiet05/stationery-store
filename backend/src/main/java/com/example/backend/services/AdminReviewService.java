package com.example.backend.services;

import com.example.backend.dto.review.*;
import com.example.backend.repositories.AdminReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
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
public class AdminReviewService {
    private final AdminReviewRepository repository;

    public Page<AdminReviewResponse> list(AdminReviewFilter request, int page, int size) {
        if (page < 0 || size < 1 || size > 50 || (long) page * size > Integer.MAX_VALUE) throw bad();
        var filter = filter(request);
        long total = repository.count(filter);
        List<AdminReviewRow> rows = repository.find(filter, page * size, size);
        var images = repository.images(rows.stream().map(AdminReviewRow::reviewID).toList());
        return new PageImpl<>(rows.stream().map(row -> new AdminReviewResponse(row, images.getOrDefault(row.reviewID(), List.of()))).toList(),
                PageRequest.of(page, size), total);
    }

    public ReviewStatisticsResponse statistics(AdminReviewFilter request) { return repository.statistics(filter(request)); }

    public AdminReviewResponse detail(Long id) {
        AdminReviewRow row = repository.detail(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Danh gia khong ton tai"));
        return new AdminReviewResponse(row, repository.images(List.of(id)).getOrDefault(id, List.of()));
    }

    public AdminReviewRepository.Filter filter(AdminReviewFilter request) {
        String search = request.search() == null ? "" : request.search().strip();
        if (search.length() > 150 || (request.rating() != null && (request.rating() < 1 || request.rating() > 5))) throw bad();
        if ((request.startDate() != null && (request.startDate().getYear() < 1 || request.startDate().getYear() > 9998))
                || (request.endDate() != null && (request.endDate().getYear() < 1 || request.endDate().getYear() > 9998))
                || (request.startDate() != null && request.endDate() != null && request.startDate().isAfter(request.endDate()))) throw bad();
        String pattern = search.isEmpty() ? null : "%" + search.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        return new AdminReviewRepository.Filter(pattern, request.rating(), request.startDate() == null ? null : request.startDate().atStartOfDay(),
                request.endDate() == null ? null : request.endDate().plusDays(1).atStartOfDay(), request.sort() == AdminReviewFilter.ReviewSort.OLDEST);
    }

    private ResponseStatusException bad() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bo loc danh gia khong hop le"); }
}
