package com.example.backend.services;

import com.example.backend.dto.tag.TagRequest;
import com.example.backend.dto.tag.TagResponse;

import java.util.List;

public interface TagService {
    List<TagResponse> getAllTags();
    TagResponse getTagById(Long id);
    TagResponse createTag(TagRequest request);
    TagResponse updateTag(Long id, TagRequest request);
    void deleteTag(Long id);
    void addTagToProduct(Long productID, Long tagID);
    void removeTagFromProduct(Long productID, Long tagID);
}