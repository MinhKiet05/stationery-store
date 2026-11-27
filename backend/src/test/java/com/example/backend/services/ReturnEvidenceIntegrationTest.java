package com.example.backend.services;

import com.example.backend.dto.returns.*;
import com.example.backend.model.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:return-evidence;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
    "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
    "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "app.ai.enabled=false", "app.ai.vector-url=",
    "spring.mail.username=test@example.test", "app.mail.from=test@example.test", "logging.level.root=WARN"
})
class ReturnEvidenceIntegrationTest {
    @Autowired ReturnEvidenceService evidence;
    @Autowired ReturnRequestService returns;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    @Autowired org.springframework.web.context.WebApplicationContext context;
    @MockitoBean ReviewImageStorage storage;
    String username, outsider;
    Long orderID, a, b;
    CreateReturnRequest body(Long detail) { return new CreateReturnRequest(orderID,"Sản phẩm kiểm thử bị hỏng",null,List.of(new ReturnItemRequest(detail,1))); }
    @BeforeEach void setup() {
        reset(storage); username="return-"+UUID.randomUUID(); outsider="other-"+UUID.randomUUID();
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            var user=User.builder().username(username).email(username+"@example.test").passwordHash("test").build(); em.persist(user);
            em.persist(User.builder().username(outsider).email(outsider+"@example.test").passwordHash("test").build());
            var p=Product.builder().title("Synthetic return product").build(); em.persist(p);
            var v=ProductVariant.builder().product(p).title("Test variant").build(); em.persist(v);
            var o=Order.builder().user(user).status(OrderStatus.DELIVERED).isPaid(true).deliveredAt(LocalDateTime.now().minusDays(1))
                    .shippingFee(new BigDecimal("40000")).discountAmount(new BigDecimal("1500000")).totalAmount(new BigDecimal("1540000")).build();
            em.persist(o); orderID=o.getOrderID();
            var x=OrderDetail.builder().order(o).variant(v).quantity(1).unitPrice(new BigDecimal("1000000")).subTotal(new BigDecimal("1000000")).build(); em.persist(x); a=x.getOrderDetailID();
            var y=OrderDetail.builder().order(o).variant(v).quantity(1).unitPrice(new BigDecimal("2000000")).subTotal(new BigDecimal("2000000")).build(); em.persist(y); b=y.getOrderDetailID();
        });
        when(storage.newPublicId("stationery-store/returns")).thenAnswer(call -> "stationery-store/returns/"+UUID.randomUUID());
        when(storage.upload(any(),anyString())).thenAnswer(call -> new ReviewImage("https://res.cloudinary.com/test/image/upload/"+call.getArgument(1)+".png",call.getArgument(1)));
    }
    @Test void snapshotIsAuthoritativeAndPublishedOnlyAfterImagesUpload() throws Exception {
        var result=evidence.create(username,body(b),List.of(ReviewImageValidatorTest.image("png")));
        assertThat(result.pricing().netAmount()).isEqualByComparingTo("1000000");
        assertThat(result.evidenceUrls()).hasSize(1);
        assertThat(returns.myRequests(username)).extracting(ReturnResponse::returnID).contains(result.returnID());
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            var saved=em.find(ReturnRequest.class,result.returnID());
            assertThat(saved.getEvidencePublicIds()).startsWith("stationery-store/returns/");
            saved.getItems().getFirst().getOrderDetail().getVariant().setPrice(BigDecimal.ONE);
        });
        assertThat(returns.get(username,result.returnID()).pricing().netAmount()).isEqualByComparingTo("1000000");
        verify(storage,never()).deleteSafely(any());
    }
    @Test void fiveImagesNearFileLimitAreUploadedAndSavedWithoutChangingRefund() throws Exception {
        byte[] png = ReviewImageValidatorTest.image("png").getBytes();
        byte[] nearLimit = Arrays.copyOf(png, ReviewImageValidator.MAX_BYTES - 1);
        var file = new MockMultipartFile("images", "near-limit.png", "image/png", nearLimit);
        var result = evidence.create(username, body(b), Collections.nCopies(5, file));
        assertThat(result.evidenceUrls()).hasSize(5);
        assertThat(result.pricing().netAmount()).isEqualByComparingTo("1000000");
        verify(storage, times(5)).upload(argThat(bytes -> bytes.length == ReviewImageValidator.MAX_BYTES - 1), anyString());
        assertThat(returns.myRequests(username)).hasSize(1);
        verify(storage, never()).deleteSafely(any());
    }
    @Test void multipartContractRequiresImagesAndRecomputesForgedMoney() throws Exception {
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(context)
                .apply(org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity()).build();
        String json="{\"orderID\":"+orderID+",\"reason\":\"Synthetic damaged item\",\"refundAmount\":999999999,\"items\":[{\"orderDetailID\":"+b+",\"quantity\":1}]}";
        var part=new MockMultipartFile("returnRequest","","application/json",json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/returns").file(part)
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(username)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/returns").file(part).file(ReviewImageValidatorTest.image("png")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/returns").file(part).file(ReviewImageValidatorTest.image("png"))
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(outsider)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/returns").file(part).file(ReviewImageValidatorTest.image("png"))
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(username)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.pricing.netAmount").value(1000000));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/returns").contentType("application/json").content(json)
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(username)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnsupportedMediaType());
    }
    @Test void ownershipAndAllFilesAreValidatedBeforeAnyUpload() throws Exception {
        assertStatus(() -> evidence.create(outsider,body(a),List.of(ReviewImageValidatorTest.image("png"))),404);
        assertStatus(() -> evidence.create(null,body(a),List.of(ReviewImageValidatorTest.image("png"))),401);
        assertStatus(() -> evidence.create(username,body(a),List.of()),400);
        assertStatus(() -> evidence.create(username,body(a),Collections.nCopies(6,ReviewImageValidatorTest.image("png"))),400);
        assertStatus(() -> evidence.create(username,body(a),List.of(ReviewImageValidatorTest.image("png"),new MockMultipartFile("images","fake.jpg","image/jpeg",new byte[]{1,2,3}))),400);
        verifyNoInteractions(storage);
    }
    @Test void failedSecondUploadCleansBothAllocatedIdsAndCreatesNoRequest() throws Exception {
        when(storage.upload(any(),anyString())).thenAnswer(call -> new ReviewImage("https://example.test/ok.png",call.getArgument(1)))
                .thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,"Test failure"));
        assertStatus(() -> evidence.create(username,body(a),List.of(ReviewImageValidatorTest.image("png"),ReviewImageValidatorTest.image("png"))),502);
        verify(storage,times(2)).deleteSafely(startsWith("stationery-store/returns/"));
        assertThat(returns.myRequests(username)).isEmpty();
    }
    @Test void failedDatabaseWriteRollsBackAndCleansUploadedEvidence() throws Exception {
        new TransactionTemplate(manager).executeWithoutResult(tx -> em.createNativeQuery("ALTER TABLE return_requests ADD CONSTRAINT return_test_failure CHECK (reason <> 'FAIL_SAVE')").executeUpdate());
        try {
            var invalid=new CreateReturnRequest(orderID,"FAIL_SAVE",null,List.of(new ReturnItemRequest(a,1)));
            assertThatThrownBy(() -> evidence.create(username,invalid,List.of(ReviewImageValidatorTest.image("png")))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            verify(storage).deleteSafely(startsWith("stationery-store/returns/"));
            assertThat(returns.myRequests(username)).isEmpty();
        } finally { new TransactionTemplate(manager).executeWithoutResult(tx -> em.createNativeQuery("ALTER TABLE return_requests DROP CONSTRAINT return_test_failure").executeUpdate()); }
    }
    @Test void concurrentUploadsRecheckQuantityUnderOrderLockAndCleanTheLoser() throws Exception {
        var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
        when(storage.upload(any(),anyString())).thenAnswer(call -> { ready.countDown(); if(!start.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Test barrier"); return new ReviewImage("https://example.test/ok.png",call.getArgument(1)); });
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Integer> create=() -> { try { evidence.create(username,body(a),List.of(ReviewImageValidatorTest.image("png"))); return 201; } catch(ResponseStatusException e) { return e.getStatusCode().value(); } };
            var first=pool.submit(create); var second=pool.submit(create);
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue(); start.countDown();
            assertThat(List.of(first.get(20,TimeUnit.SECONDS),second.get(20,TimeUnit.SECONDS))).containsExactlyInAnyOrder(201,409);
        }
        assertThat(returns.myRequests(username)).hasSize(1); verify(storage).deleteSafely(anyString());
    }
    void assertStatus(org.assertj.core.api.ThrowableAssert.ThrowingCallable action,int status) {
        assertThatThrownBy(action).isInstanceOfSatisfying(ResponseStatusException.class,e -> assertThat(e.getStatusCode().value()).isEqualTo(status));
    }
}
