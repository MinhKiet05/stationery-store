package com.example.backend.services.impl;

import com.example.backend.dto.tag.TagRequest;
import com.example.backend.dto.tag.TagResponse;
import com.example.backend.model.Product;
import com.example.backend.model.Tag;
import com.example.backend.repositories.ProductRepository;
import com.example.backend.repositories.TagRepository;
import com.example.backend.services.TagService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Transactional
public class TagServiceImpl implements TagService {

	private final TagRepository tagRepository;
	private final ProductRepository productRepository;

	@Override
	@Transactional(readOnly = true)
	public List<TagResponse> getAllTags() {
		return tagRepository.findAll().stream().map(this::toResponse).toList();
	}

	@Override
	@Transactional(readOnly = true)
	public TagResponse getTagById(Long id) {
		return toResponse(findTag(id));
	}

	@Override
	public TagResponse createTag(TagRequest request) {
		String name = validateName(request);
		if (tagRepository.existsByNameIgnoreCase(name)) {
			throw conflict("Tag name already exists");
		}

		Tag tag = new Tag();
		tag.setName(name);
		try {
			return toResponse(tagRepository.saveAndFlush(tag));
		} catch (DataIntegrityViolationException exception) {
			throw conflict("Tag could not be saved because of a data conflict");
		}
	}

	@Override
	public TagResponse updateTag(Long id, TagRequest request) {
		Tag tag = findTag(id);
		String name = validateName(request);
		if (tagRepository.existsByNameIgnoreCaseAndTagIDNot(name, id)) {
			throw conflict("Tag name already exists");
		}

		tag.setName(name);
		try {
			return toResponse(tagRepository.saveAndFlush(tag));
		} catch (DataIntegrityViolationException exception) {
			throw conflict("Tag could not be saved because of a data conflict");
		}
	}

	@Override
	public void deleteTag(Long id) {
		findTag(id);
		try {
			tagRepository.deleteProductTagLinksByTagID(id);
			tagRepository.deleteById(id);
			tagRepository.flush();
		} catch (DataIntegrityViolationException exception) {
			throw conflict("Tag could not be deleted because of a data conflict");
		}
	}

	@Override
	public void addTagToProduct(Long productID, Long tagID) {
		Product product = findProduct(productID);
		Tag tag = findTag(tagID);
		if (product.getTags().stream().anyMatch(existing ->
				Objects.equals(existing.getTagID(), tagID))) {
			throw conflict("Tag is already assigned to this product");
		}

		product.getTags().add(tag);
		try {
			productRepository.saveAndFlush(product);
		} catch (DataIntegrityViolationException exception) {
			throw conflict("Tag is already assigned to this product");
		}
	}

	@Override
	public void removeTagFromProduct(Long productID, Long tagID) {
		Product product = findProduct(productID);
		findTag(tagID);
		boolean removed = product.getTags().removeIf(existing ->
				Objects.equals(existing.getTagID(), tagID));
		if (!removed) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND,
					"Tag is not assigned to this product");
		}
		productRepository.saveAndFlush(product);
	}

	private Product findProduct(Long id) {
		return productRepository.findById(id)
				.orElseThrow(() -> new ResponseStatusException(
						HttpStatus.NOT_FOUND, "Product not found: " + id));
	}

	private Tag findTag(Long id) {
		return tagRepository.findById(id)
				.orElseThrow(() -> new ResponseStatusException(
						HttpStatus.NOT_FOUND, "Tag not found: " + id));
	}

	private String validateName(TagRequest request) {
		if (request == null || request.name() == null) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
		}
		String name = request.name().trim();
		if (name.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name must not be blank");
		}
		if (name.length() > 100) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name must not exceed 100 characters");
		}
		return name;
	}

	private TagResponse toResponse(Tag tag) {
		return new TagResponse(tag.getTagID(), tag.getName());
	}

	private ResponseStatusException conflict(String message) {
		return new ResponseStatusException(HttpStatus.CONFLICT, message);
	}
}
