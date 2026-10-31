package com.example.backend.services.impl;

import com.example.backend.dto.tag.TagRequest;
import com.example.backend.model.Product;
import com.example.backend.model.Tag;
import com.example.backend.repositories.ProductRepository;
import com.example.backend.repositories.TagRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TagServiceImplTest {

    @Mock
    private TagRepository tagRepository;

    @Mock
    private ProductRepository productRepository;

    @InjectMocks
    private TagServiceImpl tagService;

    @Test
    void createTagTrimsName() {
        when(tagRepository.existsByNameIgnoreCase("Sale")).thenReturn(false);
        when(tagRepository.saveAndFlush(any(Tag.class))).thenAnswer(invocation -> {
            Tag tag = invocation.getArgument(0);
            tag.setTagID(4L);
            return tag;
        });

        var response = tagService.createTag(new TagRequest("  Sale  "));

        assertEquals(4L, response.tagID());
        assertEquals("Sale", response.name());
    }

    @Test
    void getTagByIdReturnsNotFoundWhenMissing() {
        when(tagRepository.findById(99L)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class, () -> tagService.getTagById(99L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    void createTagRejectsDuplicateName() {
        when(tagRepository.existsByNameIgnoreCase("sale")).thenReturn(true);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> tagService.createTag(new TagRequest("sale")));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
    }

    @Test
    void addTagToProductAddsOwningSideAssociation() {
        Product product = new Product();
        Tag tag = new Tag(8L, "Bán chạy");
        when(productRepository.findById(5L)).thenReturn(Optional.of(product));
        when(tagRepository.findById(8L)).thenReturn(Optional.of(tag));
        when(productRepository.saveAndFlush(any(Product.class))).thenReturn(product);

        tagService.addTagToProduct(5L, 8L);

        assertTrue(product.getTags().contains(tag));
        verify(productRepository).saveAndFlush(product);
    }

    @Test
    void addTagToProductRejectsExistingAssociation() {
        Product product = new Product();
        product.getTags().add(new Tag(8L, "Bán chạy"));
        when(productRepository.findById(5L)).thenReturn(Optional.of(product));
        when(tagRepository.findById(8L)).thenReturn(Optional.of(new Tag(8L, "Bán chạy")));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class, () -> tagService.addTagToProduct(5L, 8L));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
    }

    @Test
    void addTagToProductReturnsNotFoundWhenProductIsMissing() {
        when(productRepository.findById(5L)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class, () -> tagService.addTagToProduct(5L, 8L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    void removeTagFromProductReturnsNotFoundWhenAssociationIsMissing() {
        Product product = new Product();
        when(productRepository.findById(5L)).thenReturn(Optional.of(product));
        when(tagRepository.findById(8L)).thenReturn(Optional.of(new Tag(8L, "Bán chạy")));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class, () -> tagService.removeTagFromProduct(5L, 8L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }
}