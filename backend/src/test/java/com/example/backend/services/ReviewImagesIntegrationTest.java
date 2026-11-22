package com.example.backend.services;

import com.example.backend.dto.review.ReviewRequest;
import com.example.backend.model.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static com.example.backend.services.ReviewImageValidatorTest.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:review-images;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop", "app.ai.enabled=false",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "logging.level.root=WARN", "logging.level.org.hibernate.SQL=OFF",
        "logging.level.org.hibernate.orm.jdbc.bind=OFF", "spring.jpa.show-sql=false"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ReviewImagesIntegrationTest {
    @Autowired ReviewService service;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired MockMvc mvc;
    @MockitoBean ReviewImageStorage storage;
    private TransactionTemplate tx;
    private Long productId;
    private String username;
    private String outsider;
    private final ReviewRequest request = new ReviewRequest(5, "Good product");

    @BeforeEach void setup() {
        tx = new TransactionTemplate(transactionManager);
        username = "review-" + UUID.randomUUID();
        outsider = "other-" + UUID.randomUUID();
        tx.executeWithoutResult(status -> {
            var owner = User.builder().username(username).email(username + "@test.test").passwordHash("test").build();
            em.persist(owner);
            em.persist(User.builder().username(outsider).email(outsider + "@test.test").passwordHash("test").build());
            var product = Product.builder().title("Review image fixture").build();
            em.persist(product);
            productId = product.getProductID();
            var variant = ProductVariant.builder().title("Fixture variant").product(product).build();
            em.persist(variant);
            var order = Order.builder().user(owner).status(OrderStatus.DELIVERED).build();
            em.persist(order);
            em.persist(OrderDetail.builder().order(order).variant(variant).quantity(1)
                    .unitPrice(BigDecimal.ONE).subTotal(BigDecimal.ONE).build());
        });
        when(storage.newPublicId()).thenAnswer(invocation -> ReviewImageStorage.FOLDER + "/" + UUID.randomUUID());
        when(storage.upload(any(), anyString())).thenAnswer(invocation -> new ReviewImage(
                "https://res.cloudinary.com/test/image/upload/" + invocation.getArgument(1) + ".png",
                invocation.getArgument(1)));
    }

    @Test void createsAndReadsFiveImagesInOrder() throws Exception {
        var response = service.create(productId, username, request, java.util.Collections.nCopies(5, image("png")));
        assertThat(response.images()).hasSize(5);
        var reloaded = service.getByProduct(productId).getFirst();
        assertThat(reloaded).usingRecursiveComparison().ignoringFields("reviewDate").isEqualTo(response);
        assertThat(reloaded.reviewDate()).isCloseTo(response.reviewDate(),
                within(1, java.time.temporal.ChronoUnit.MICROS));
        assertThat(response.images()).extracting(i -> i.imagePosition()).containsExactly(0, 1, 2, 3, 4);
        verify(storage, never()).deleteSafely(anyString());
    }

    @Test void jsonReviewsWorkWithoutAnyStorageCallsAndPreserveImagesOnUpdate() throws Exception {
        mvc.perform(post("/api/products/{id}/reviews", productId).with(user(username))
                .contentType("application/json").content("{\"rating\":5,\"comment\":\"Text only\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.images").isEmpty());
        verifyNoInteractions(storage);
        var response = service.getByProduct(productId).getFirst();
        mvc.perform(put("/api/reviews/{id}", response.reviewID()).with(user(username))
                .contentType("application/json").content("{\"rating\":4,\"comment\":\"Updated\"}"))
                .andExpect(status().isOk());
        service.delete(response.reviewID(), username);
        verifyNoInteractions(storage);
    }

    @Test void addsAndRemovesOnlyAfterCommitAndReindexes() throws Exception {
        var created = service.create(productId, username, request, List.of(image("png"), image("jpeg")));
        String oldId = publicId(created.reviewID(), 0);
        clearInvocations(storage);
        tx.executeWithoutResult(status -> {
            try {
                service.update(created.reviewID(), username, request, List.of(image("png")), List.of(0));
            } catch (Exception error) { throw new RuntimeException(error); }
            verify(storage, never()).deleteSafely(anyString());
        });
        verify(storage).deleteSafely(oldId);
        var updated = service.getByProduct(productId).getFirst();
        assertThat(updated.images()).hasSize(2);
        assertThat(updated.images().getFirst().imageUrl()).isEqualTo(created.images().get(1).imageUrl());
        assertThat(updated.images()).extracting(i -> i.imagePosition()).containsExactly(0, 1);
        assertThat(service.update(created.reviewID(), username, request).images()).isEqualTo(updated.images());
    }

    @Test void databaseFailureCleansNewUploadAndKeepsOldImage() throws Exception {
        var created = service.create(productId, username, request, List.of(image("png")));
        String oldId = publicId(created.reviewID(), 0);
        clearInvocations(storage);
        when(storage.upload(any(), anyString())).thenAnswer(invocation -> new ReviewImage(
                "https://example.test/" + "x".repeat(501), invocation.getArgument(1)));
        assertThatThrownBy(() -> service.update(created.reviewID(), username, request,
                List.of(image("png")), List.of(0))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        verify(storage).deleteSafely(argThat(id -> !oldId.equals(id)));
        verify(storage, never()).deleteSafely(oldId);
        assertThat(service.getByProduct(productId).getFirst().images()).isEqualTo(created.images());
    }

    @Test void partialUploadFailureCleansAllAttemptedIds() throws Exception {
        var counter = new AtomicInteger();
        when(storage.upload(any(), anyString())).thenAnswer(invocation -> {
            if (counter.incrementAndGet() == 2) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Upload failed");
            return new ReviewImage("https://example.test/x.png", invocation.getArgument(1));
        });
        assertStatus(() -> service.create(productId, username, request, List.of(image("png"), image("png"))), 502);
        verify(storage, times(2)).deleteSafely(anyString());
        assertThat(service.getByProduct(productId)).isEmpty();
    }

    @Test void rollbackNeverDeletesOldImages() throws Exception {
        var created = service.create(productId, username, request, List.of(image("png")));
        clearInvocations(storage);
        tx.executeWithoutResult(status -> {
            service.delete(created.reviewID(), username);
            status.setRollbackOnly();
        });
        verifyNoInteractions(storage);
        assertThat(service.getByProduct(productId)).hasSize(1);
        tx.executeWithoutResult(status -> {
            service.delete(created.reviewID(), username);
            verifyNoInteractions(storage);
        });
        verify(storage).deleteSafely(anyString());
        assertThat(service.getByProduct(productId)).isEmpty();
    }

    @Test void preservesPurchaseDuplicateAndOwnershipChecks() throws Exception {
        assertStatus(() -> service.create(productId, outsider, request, List.of(image("png"))), 403);
        var created = service.create(productId, username, request, List.of(image("png")));
        clearInvocations(storage);
        assertStatus(() -> service.create(productId, username, request, List.of(image("png"))), 409);
        assertStatus(() -> service.update(created.reviewID(), outsider, request, List.of(image("png")), List.of(0)), 403);
        assertStatus(() -> service.delete(created.reviewID(), outsider), 403);
        assertStatus(() -> service.update(created.reviewID(), username, request, List.of(), List.of(2)), 400);
        assertStatus(() -> service.update(created.reviewID(), username, request, List.of(), List.of(0, 0)), 400);
        verifyNoInteractions(storage);
    }

    @Test void invalidBatchIsRejectedBeforeUploadingAnyFile() throws Exception {
        var fake = new MockMultipartFile("images", "fake.png", "image/png", new byte[]{1, 2, 3});
        assertStatus(() -> service.create(productId, username, request, List.of(image("png"), fake)), 400);
        assertStatus(() -> service.create(productId, username, request,
                java.util.Collections.nCopies(6, image("png"))), 400);
        verifyNoInteractions(storage);
    }

    @Test void clientCannotAttachAnExistingCloudinaryUrlThroughJson() throws Exception {
        mvc.perform(post("/api/products/{id}/reviews", productId).with(user(username))
                .contentType("application/json").content("""
                    {"rating":5,"comment":"Good product",
                     "images":[{"imageUrl":"https://res.cloudinary.com/other/image/upload/stolen.png",
                                "publicId":"catalog/other-review"}]}
                    """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.images").isEmpty());
        assertThat(service.getByProduct(productId).getFirst().images()).isEmpty();
        verifyNoInteractions(storage);
    }

    @Test void multipartEndpointsRequireLoginAndSupportCreateAndRemoval() throws Exception {
        var review = new MockMultipartFile("review", "", "application/json",
                "{\"rating\":5,\"comment\":\"With photo\"}".getBytes());
        mvc.perform(multipart("/api/products/{id}/reviews", productId).file(review).file(image("png")))
                .andExpect(status().isUnauthorized());
        mvc.perform(multipart("/api/products/{id}/reviews", productId).file(review).file(image("png"))
                .with(user(username))).andExpect(status().isCreated()).andExpect(jsonPath("$.images[0].imagePosition").value(0))
                .andExpect(jsonPath("$.images[0].publicId").doesNotExist());
        var created = service.getByProduct(productId).getFirst();
        mvc.perform(multipart(org.springframework.http.HttpMethod.PUT, "/api/reviews/{id}", created.reviewID())
                .file(review).file(new MockMultipartFile("removeImagePositions", "", "application/json", "[0]".getBytes()))
                .with(user(outsider))).andExpect(status().isForbidden());
        mvc.perform(multipart(org.springframework.http.HttpMethod.PUT, "/api/reviews/{id}", created.reviewID())
                .file(review).file(new MockMultipartFile("removeImagePositions", "", "application/json", "[0]".getBytes()))
                .with(user(username))).andExpect(status().isOk()).andExpect(jsonPath("$.images").isEmpty());
    }

    private String publicId(Long reviewId, int position) {
        return tx.execute(status -> em.find(Review.class, reviewId).getImages().get(position).getPublicId());
    }
}
