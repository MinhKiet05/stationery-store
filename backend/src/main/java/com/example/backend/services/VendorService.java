package com.example.backend.services;

import com.example.backend.dto.vendor.VendorRequest;
import com.example.backend.dto.vendor.VendorResponse;

import java.util.List;

public interface VendorService {
    List<VendorResponse> getAllVendors();
    VendorResponse getVendorById(Long id);
    VendorResponse createVendor(VendorRequest request);
    VendorResponse updateVendor(Long id, VendorRequest request);
    void deleteVendor(Long id);
}