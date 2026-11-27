package com.example.backend.dto;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;

import java.util.List;

/** Explicit snapshot of the existing PageImpl JSON contract. Page indices stay zero based. */
public record PageResponse<T>(
        List<T> content, PageableResponse pageable, SortResponse sort,
        int number, int size, long totalElements, int totalPages,
        boolean first, boolean last, boolean empty, int numberOfElements) {

    public static <T> PageResponse<T> from(Page<T> page) {
        var pageable = page.getPageable();
        var sort = SortResponse.from(page.getSort());
        return new PageResponse<>(List.copyOf(page.getContent()),
            new PageableResponse(page.getNumber(), page.getSize(),
                pageable.isPaged() ? pageable.getOffset() : 0, pageable.isPaged(), pageable.isUnpaged(), sort),
            sort, page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(),
            page.isFirst(), page.isLast(), page.isEmpty(), page.getNumberOfElements());
    }

    public record PageableResponse(int pageNumber, int pageSize, long offset,
                                   boolean paged, boolean unpaged, SortResponse sort) {}

    public record SortResponse(boolean sorted, boolean unsorted, boolean empty) {
        static SortResponse from(Sort sort) {
            return new SortResponse(sort.isSorted(), sort.isUnsorted(), sort.isEmpty());
        }
    }
}
