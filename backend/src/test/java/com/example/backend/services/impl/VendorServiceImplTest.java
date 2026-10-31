package com.example.backend.services.impl;

import com.example.backend.dto.vendor.VendorRequest;
import com.example.backend.model.Vendor;
import com.example.backend.repositories.VendorRepository;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VendorServiceImplTest {

    @Mock
    private VendorRepository vendorRepository;

    @InjectMocks
    private VendorServiceImpl vendorService;

    @Test
    void createVendorTrimsName() {
        when(vendorRepository.existsByNameIgnoreCase("Deli")).thenReturn(false);
        when(vendorRepository.saveAndFlush(any(Vendor.class))).thenAnswer(invocation -> {
            Vendor vendor = invocation.getArgument(0);
            vendor.setVendorID(7L);
            return vendor;
        });

        var response = vendorService.createVendor(new VendorRequest("  Deli  "));

        assertEquals(7L, response.vendorID());
        assertEquals("Deli", response.name());
    }

    @Test
    void getVendorByIdReturnsNotFoundWhenMissing() {
        when(vendorRepository.findById(99L)).thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class, () -> vendorService.getVendorById(99L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    void createVendorRejectsDuplicateName() {
        when(vendorRepository.existsByNameIgnoreCase("deli")).thenReturn(true);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> vendorService.createVendor(new VendorRequest("deli")));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
    }

    @Test
    void deleteVendorRejectsReferencedVendorWithCount() {
        Vendor vendor = new Vendor(3L, "Deli");
        when(vendorRepository.findById(3L)).thenReturn(Optional.of(vendor));
        when(vendorRepository.countProductsByVendorID(3L)).thenReturn(2L);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class, () -> vendorService.deleteVendor(3L));

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(vendorRepository).countProductsByVendorID(3L);
    }
}