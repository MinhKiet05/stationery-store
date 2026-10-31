package com.example.backend.services.impl;

import com.example.backend.dto.vendor.VendorRequest;
import com.example.backend.dto.vendor.VendorResponse;
import com.example.backend.model.Vendor;
import com.example.backend.repositories.VendorRepository;
import com.example.backend.services.VendorService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class VendorServiceImpl implements VendorService {

	private final VendorRepository vendorRepository;

	@Override
	@Transactional(readOnly = true)
	public List<VendorResponse> getAllVendors() {
		return vendorRepository.findAll().stream().map(this::toResponse).toList();
	}

	@Override
	@Transactional(readOnly = true)
	public VendorResponse getVendorById(Long id) {
		return toResponse(findVendor(id));
	}

	@Override
	public VendorResponse createVendor(VendorRequest request) {
		String name = validateName(request);
		if (vendorRepository.existsByNameIgnoreCase(name)) {
			throw conflict("Vendor name already exists");
		}

		Vendor vendor = new Vendor();
		vendor.setName(name);
		try {
			return toResponse(vendorRepository.saveAndFlush(vendor));
		} catch (DataIntegrityViolationException exception) {
			throw conflict("Vendor could not be saved because of a data conflict");
		}
	}

	@Override
	public VendorResponse updateVendor(Long id, VendorRequest request) {
		Vendor vendor = findVendor(id);
		String name = validateName(request);
		if (vendorRepository.existsByNameIgnoreCaseAndVendorIDNot(name, id)) {
			throw conflict("Vendor name already exists");
		}

		vendor.setName(name);
		try {
			return toResponse(vendorRepository.saveAndFlush(vendor));
		} catch (DataIntegrityViolationException exception) {
			throw conflict("Vendor could not be saved because of a data conflict");
		}
	}

	@Override
	public void deleteVendor(Long id) {
		Vendor vendor = findVendor(id);
		long productCount = vendorRepository.countProductsByVendorID(id);
		if (productCount > 0) {
			throw conflict("Vendor is referenced by " + productCount + " product(s)");
		}

		try {
			vendorRepository.delete(vendor);
			vendorRepository.flush();
		} catch (DataIntegrityViolationException exception) {
			throw conflict("Vendor is still referenced by product data");
		}
	}

	private Vendor findVendor(Long id) {
		return vendorRepository.findById(id)
				.orElseThrow(() -> new ResponseStatusException(
						HttpStatus.NOT_FOUND, "Vendor not found: " + id));
	}

	private String validateName(VendorRequest request) {
		if (request == null || request.name() == null) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
		}
		String name = request.name().trim();
		if (name.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name must not be blank");
		}
		if (name.length() > 150) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name must not exceed 150 characters");
		}
		return name;
	}

	private VendorResponse toResponse(Vendor vendor) {
		return new VendorResponse(vendor.getVendorID(), vendor.getName());
	}

	private ResponseStatusException conflict(String message) {
		return new ResponseStatusException(HttpStatus.CONFLICT, message);
	}
}
