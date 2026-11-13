package com.example.backend.controller;

import com.example.backend.dto.tag.TagRequest;
import com.example.backend.dto.tag.TagResponse;
import com.example.backend.services.TagService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    @GetMapping("/api/tags")
    public ResponseEntity<List<TagResponse>> getAllTags() {
        return ResponseEntity.ok(tagService.getAllTags());
    }

    @GetMapping("/api/tags/{id}")
    public ResponseEntity<TagResponse> getTagById(@PathVariable Long id) {
        return ResponseEntity.ok(tagService.getTagById(id));
    }

    @PostMapping("/api/tags")
    public ResponseEntity<TagResponse> createTag(@RequestBody TagRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tagService.createTag(request));
    }

    @PutMapping("/api/tags/{id}")
    public ResponseEntity<TagResponse> updateTag(
            @PathVariable Long id, @RequestBody TagRequest request) {
        return ResponseEntity.ok(tagService.updateTag(id, request));
    }

    @DeleteMapping("/api/tags/{id}")
    public ResponseEntity<Void> deleteTag(@PathVariable Long id) {
        tagService.deleteTag(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/products/{productID}/tags/{tagID}")
    public ResponseEntity<Void> addTagToProduct(
            @PathVariable Long productID, @PathVariable Long tagID) {
        tagService.addTagToProduct(productID, tagID);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @DeleteMapping("/api/products/{productID}/tags/{tagID}")
    public ResponseEntity<Void> removeTagFromProduct(
            @PathVariable Long productID, @PathVariable Long tagID) {
        tagService.removeTagFromProduct(productID, tagID);
        return ResponseEntity.noContent().build();
    }
}