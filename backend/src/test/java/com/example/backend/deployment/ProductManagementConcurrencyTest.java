package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.services.*;
import com.example.backend.dto.returns.UpdateReturnStatusRequest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:product-management-concurrency;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.returns.max-export-rows=20"
})
class ProductManagementConcurrencyTest {
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    @Autowired AdminProductService service;
    @Autowired ProductVariantService variants;
    @Autowired com.example.backend.ai.ProductCatalog catalog;
    @MockitoBean ReviewImageStorage storage;
    @MockitoBean com.example.backend.ai.CatalogAi ai;
    record Fixture(Long product,Long variant) {}
    private Fixture fixture(String name) {
        return new TransactionTemplate(manager).execute(ignored->{
            var p=Product.builder().title(name).price(BigDecimal.TEN).description("Original committed description").build();p.getImages().add("https://example.test/original.png");em.persist(p);
            var v=ProductVariant.builder().product(p).title("Variant").sku(name).price(BigDecimal.TEN).stockQuantity(8).build();em.persist(v);return new Fixture(p.getProductID(),v.getVariantID());
        });
    }
    private com.example.backend.dto.product.ProductRequest request(String title){return new com.example.backend.dto.product.ProductRequest(title,null,"Committed updated description",BigDecimal.TEN,null,null,null,null,null,List.of("https://example.test/updated.png"),java.util.Set.of(),true);}
    @Test @org.springframework.security.test.context.support.WithMockUser(roles="ADMIN") void twoProductMetadataEditsWithPreloadedCollectionsHaveOneWinner()throws Exception {
        var f=fixture("metadata-race");String expected=new TransactionTemplate(manager).execute(ignored->service.detail(f.product()).stateToken());
        var results=race(f,index->service.update(f.product(),new com.example.backend.dto.product.AdminProductDetail.Write(request("Edited "+index),expected)));
        assertThat(results).containsExactlyInAnyOrder(200,409);
        new TransactionTemplate(manager).executeWithoutResult(ignored->{var p=em.find(Product.class,f.product());assertThat(p.getTitle()).isIn("Edited 0","Edited 1");assertThat(p.getImages()).containsExactly("https://example.test/updated.png");});
    }
    @Test void inventoryAndVariantMetadataWithSameVersionNeverLoseInventoryOrOverwriteEachOther()throws Exception {
        var f=fixture("variant-race");
        var results=race(f,index->{if(index==0)variants.updateStock(f.variant(),new com.example.backend.dto.productvariant.UpdateStockRequest(BigDecimal.valueOf(11),0L));else service.updateVariant(f.product(),f.variant(),new com.example.backend.dto.product.AdminProductDetail.VariantWrite(new com.example.backend.dto.productvariant.ProductVariantRequest(f.product(),"Changed variant","variant-race",false,BigDecimal.valueOf(20),null,null,null,null,999),0L,null));});
        assertThat(results).containsExactlyInAnyOrder(200,409);
        new TransactionTemplate(manager).executeWithoutResult(ignored->{var v=em.find(ProductVariant.class,f.variant());assertThat(v.getVersion()).isEqualTo(1L);assertThat(v.getStockQuantity()).isIn(8,11);if(v.getStockQuantity()==11)assertThat(v.getPrice()).isEqualByComparingTo("10");else assertThat(v.getPrice()).isEqualByComparingTo("20");});
    }
    @Test @org.springframework.security.test.context.support.WithMockUser(roles="ADMIN") void scheduledIndexReadsOnlyCommittedCatalogAndMutationNeverCallsEmbedding()throws Exception {
        var f=fixture("ai-consistency");var props=new com.example.backend.ai.AiProperties();props.setEnabled(true);
        var mock=org.mockito.Mockito.mock(com.example.backend.ai.CatalogAi.class);
        var job=new com.example.backend.ai.ProductIndexJob(catalog,mock,props);
        var tx=new TransactionTemplate(manager);
        String before=tx.execute(ignored->service.detail(f.product()).stateToken());
        // A different reader sees the last committed catalog, not the writer's uncommitted edit.
        tx.executeWithoutResult(ignored->{
            service.update(f.product(),new com.example.backend.dto.product.AdminProductDetail.Write(request("Committed renamed product"),before));em.flush();
            try(var pool=Executors.newSingleThreadExecutor()){try{pool.submit(job::reindex).get(10,TimeUnit.SECONDS);}catch(Exception failure){throw new IllegalStateException(failure);}}
        });
        var captured=org.mockito.ArgumentCaptor.forClass(com.example.backend.ai.CatalogProduct.class);org.mockito.Mockito.verify(mock,org.mockito.Mockito.atLeastOnce()).synchronize(captured.capture());
        assertThat(captured.getAllValues().stream().filter(p->p.product().productID().equals(f.product())).toList()).allSatisfy(p->assertThat(p.semanticText()).contains("Original committed description").doesNotContain("Committed renamed product"));
        org.mockito.Mockito.clearInvocations(mock);job.reindex();org.mockito.Mockito.verify(mock,org.mockito.Mockito.atLeastOnce()).synchronize(captured.capture());
        assertThat(captured.getValue().semanticText()).contains("Committed renamed product","Committed updated description");
        var snapshot=tx.execute(ignored->service.detail(f.product()));tx.executeWithoutResult(ignored->service.status(f.product(),new com.example.backend.dto.product.AdminProductDetail.Status(false,snapshot.stateToken())));
        assertThat(catalog.byIds(List.of(f.product())).getFirst().sellable()).isFalse();org.mockito.Mockito.verifyNoInteractions(ai);
        org.mockito.Mockito.when(mock.synchronize(org.mockito.ArgumentMatchers.any())).thenThrow(new IllegalStateException("Simulated embedding failure"));
        assertThat(org.assertj.core.api.Assertions.catchThrowable(job::reindex)).isInstanceOf(IllegalStateException.class);
        assertThat(tx.execute(ignored->service.detail(f.product())).product().available()).isFalse();
    }
    private List<Integer> race(Fixture f,java.util.function.IntConsumer operation)throws Exception {
        var ready=new CountDownLatch(2);var start=new CountDownLatch(1);var tx=new TransactionTemplate(manager);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var futures=new java.util.ArrayList<Future<Integer>>();
            for(int i=0;i<2;i++){final int index=i;futures.add(pool.submit(()->{
                var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated("admin",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));SecurityContextHolder.setContext(context);
                try{tx.executeWithoutResult(ignored->{var p=em.find(Product.class,f.product());p.getImages().size();p.getTags().size();em.find(ProductVariant.class,f.variant()).getVersion();ready.countDown();try{if(!start.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}operation.accept(index);});return 200;}
                catch(ResponseStatusException e){return e.getStatusCode().value();}catch(org.springframework.dao.OptimisticLockingFailureException stale){return 409;}finally{SecurityContextHolder.clearContext();}
            }));}
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();start.countDown();return List.of(futures.get(0).get(30,TimeUnit.SECONDS),futures.get(1).get(30,TimeUnit.SECONDS));
        }
    }
}
