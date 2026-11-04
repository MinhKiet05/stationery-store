package com.example.backend.services.impl;

import com.example.backend.dto.producttype.ProductTypeRequest;
import com.example.backend.model.ProductType;
import com.example.backend.repositories.ProductTypeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductTypeServiceImplTest {

    @Mock
    private ProductTypeRepository productTypeRepository;

    @InjectMocks
    private ProductTypeServiceImpl productTypeService;

    @Test
    void getAllProductTypesIncludesInactiveCategories() {
        when(productTypeRepository.findAll()).thenReturn(List.of(
                new ProductType(1L, "Pens", true), new ProductType(2L, "Paper", false)));

        var response = productTypeService.getAllProductTypes();

        assertEquals(2, response.size());
        assertEquals(1L, response.get(0).productTypeID());
        assertEquals("Pens", response.get(0).name());
        assertFalse(response.get(1).isActive());
    }

    @Test
    void getProductTypeByIdReturnsInactiveCategory() {
        when(productTypeRepository.findById(2L)).thenReturn(
                Optional.of(new ProductType(2L, "Paper", false)));

        var response = productTypeService.getProductTypeById(2L);

        assertEquals(2L, response.productTypeID());
        assertFalse(response.isActive());
    }

    @Test
    void createProductTypeTrimsNameAndDefaultsToActive() {
        when(productTypeRepository.saveAndFlush(any(ProductType.class))).thenAnswer(invocation -> {
            ProductType productType = invocation.getArgument(0);
            productType.setProductTypeID(7L);
            return productType;
        });

        var response = productTypeService.createProductType(new ProductTypeRequest("  Pens  ", null));

        assertEquals(7L, response.productTypeID());
        assertEquals("Pens", response.name());
        assertTrue(response.isActive());
        verify(productTypeRepository).existsByNameIgnoreCase("Pens");
    }

    @Test
    void createProductTypeAcceptsExplicitInactiveStateAndMaximumNameLength() {
        when(productTypeRepository.saveAndFlush(any(ProductType.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = productTypeService.createProductType(new ProductTypeRequest("P".repeat(100), false));

        assertEquals(100, response.name().length());
        assertFalse(response.isActive());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\t\n", "\u2003"})
    void createProductTypeRejectsMissingOrBlankNames(String name) {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> productTypeService.createProductType(new ProductTypeRequest(name, null)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        verifyNoInteractions(productTypeRepository);
    }

    @Test
    void createProductTypeRejectsNullRequestAndOverlongName() {
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> productTypeService.createProductType(null)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> productTypeService.createProductType(
                        new ProductTypeRequest("P".repeat(101), true))).getStatusCode());
        verifyNoInteractions(productTypeRepository);
    }

    @Test
    void createProductTypeRejectsDuplicateNameIncludingInactiveCategories() {
        when(productTypeRepository.existsByNameIgnoreCase("pens")).thenReturn(true);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> productTypeService.createProductType(new ProductTypeRequest(" pens ", true)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(productTypeRepository, never()).saveAndFlush(any());
    }

    @Test
    void updateProductTypeCanKeepOwnNameAndReactivate() {
        ProductType productType = new ProductType(1L, "Pens", false);
        when(productTypeRepository.findById(1L)).thenReturn(Optional.of(productType));
        when(productTypeRepository.saveAndFlush(productType)).thenReturn(productType);

        var response = productTypeService.updateProductType(1L, new ProductTypeRequest(" Pens ", true));

        assertEquals("Pens", response.name());
        assertTrue(response.isActive());
        verify(productTypeRepository).existsByNameIgnoreCaseAndProductTypeIDNot("Pens", 1L);
    }

    @Test
    void updateProductTypeChangesNameAndStatus() {
        ProductType productType = new ProductType(1L, "Pens", true);
        when(productTypeRepository.findById(1L)).thenReturn(Optional.of(productType));
        when(productTypeRepository.saveAndFlush(productType)).thenReturn(productType);

        var response = productTypeService.updateProductType(1L, new ProductTypeRequest(" Paper ", false));

        assertEquals("Paper", response.name());
        assertFalse(response.isActive());
    }

    @Test
    void updateProductTypePreservesStatusWhenOmitted() {
        ProductType productType = new ProductType(1L, "Pens", false);
        when(productTypeRepository.findById(1L)).thenReturn(Optional.of(productType));
        when(productTypeRepository.saveAndFlush(productType)).thenReturn(productType);

        var response = productTypeService.updateProductType(1L, new ProductTypeRequest("Paper", null));

        assertEquals("Paper", response.name());
        assertFalse(response.isActive());
    }

    @Test
    void updateProductTypeRejectsAnotherCategoryNameWithoutChangingEntity() {
        ProductType productType = new ProductType(1L, "Pens", true);
        when(productTypeRepository.findById(1L)).thenReturn(Optional.of(productType));
        when(productTypeRepository.existsByNameIgnoreCaseAndProductTypeIDNot("Paper", 1L)).thenReturn(true);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> productTypeService.updateProductType(1L, new ProductTypeRequest("Paper", false)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        assertEquals("Pens", productType.getName());
        assertTrue(productType.getIsActive());
        verify(productTypeRepository, never()).saveAndFlush(any());
    }

    @Test
    void updateProductTypeRejectsInvalidNameWithoutChangingEntity() {
        ProductType productType = new ProductType(1L, "Pens", true);
        when(productTypeRepository.findById(1L)).thenReturn(Optional.of(productType));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> productTypeService.updateProductType(1L, new ProductTypeRequest(" ", false)));

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        assertEquals("Pens", productType.getName());
        assertTrue(productType.getIsActive());
        verify(productTypeRepository, never()).saveAndFlush(any());
    }

    @Test
    void missingCategoryReturns404ForReadUpdateAndDelete() {
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> productTypeService.getProductTypeById(99L)).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> productTypeService.updateProductType(99L,
                        new ProductTypeRequest("Pens", true))).getStatusCode());
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> productTypeService.deleteProductType(99L)).getStatusCode());
        verify(productTypeRepository, never()).saveAndFlush(any());
    }

    @Test
    void deleteProductTypeOnlyDeactivatesAndCanBeRepeated() {
        ProductType productType = new ProductType(1L, "Pens", true);
        when(productTypeRepository.findById(1L)).thenReturn(Optional.of(productType));
        when(productTypeRepository.saveAndFlush(productType)).thenReturn(productType);

        productTypeService.deleteProductType(1L);
        productTypeService.deleteProductType(1L);

        assertEquals(1L, productType.getProductTypeID());
        assertEquals("Pens", productType.getName());
        assertFalse(productType.getIsActive());
        verify(productTypeRepository, times(2)).saveAndFlush(productType);
        verify(productTypeRepository, never()).delete(any(ProductType.class));
        verify(productTypeRepository, never()).deleteById(any());
    }

    @Test
    void databaseUniquenessConflictReturns409WithoutExposingSql() {
        when(productTypeRepository.saveAndFlush(any(ProductType.class)))
                .thenThrow(new DataIntegrityViolationException("internal SQL diagnostics"));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> productTypeService.createProductType(new ProductTypeRequest("Pens", true)));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        assertFalse(exception.getReason().contains("internal SQL diagnostics"));
    }
}
