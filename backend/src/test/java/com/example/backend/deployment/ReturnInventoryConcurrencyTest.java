package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.dto.returns.*;
import com.example.backend.services.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:return-inventory-concurrency;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.returns.max-export-rows=20"
})
@WithMockUser(username="admin",roles="ADMIN")
class ReturnInventoryConcurrencyTest {
    @Autowired EntityManager em;
    @Autowired ReturnInventoryService inventory;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean ReviewImageStorage storage;
    TransactionTemplate tx;
    Fixture fixture;
    record Fixture(Long request,Long a,Long b,Long firstVariant,Long secondVariant) {}
    @BeforeEach void setup() { tx=new TransactionTemplate(manager); fixture=seed(null); }

    @Test void concurrentReceiveAndConcurrentRestockEachHaveOneWinnerAndRetryDoesNotAddTwice() throws Exception {
        assertThat(race(fixture.request(),()->inventory.receive(fixture.request(),receive(fixture)),fixture.request(),()->inventory.receive(fixture.request(),receive(fixture))))
            .containsExactlyInAnyOrder(200,409);
        stock(fixture,8,5);
        assertThat(race(fixture.request(),()->inventory.restock(fixture.request(),restock(fixture)),fixture.request(),()->inventory.restock(fixture.request(),restock(fixture))))
            .containsExactlyInAnyOrder(200,409);
        stock(fixture,10,5);
        assertThatThrownBy(()->inventory.restock(fixture.request(),restock(fixture))).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));
        stock(fixture,10,5);
    }
    @Test void differentReturnsSharingVariantsDoNotLoseConcurrentInventoryIncrements() throws Exception {
        Fixture another=seed(fixture); inventory.receive(fixture.request(),receive(fixture)); inventory.receive(another.request(),receive(another));
        assertThat(race(fixture.request(),()->inventory.restock(fixture.request(),restock(fixture)),another.request(),()->inventory.restock(another.request(),restock(another))))
            .containsExactlyInAnyOrder(200,200);
        stock(fixture,12,5);
    }
    @Test void databaseWriteFailureRollsBackInventoryInspectionAndCompletionTogetherAndRetryWorks() {
        inventory.receive(fixture.request(),receive(fixture));
        assertThatThrownBy(()->tx.executeWithoutResult(ignored->{
            inventory.restock(fixture.request(),restock(fixture)); // flushes actual stock and inspection SQL, still in this transaction.
            // Force a real persistence failure in the same unit of work, after the stock writes.
            em.createNativeQuery("insert into store.return_receipt_items (return_item_id,return_id,variant_id,received_quantity,good_quantity,damaged_quantity,stock_before,stock_after) "
                +"select return_item_id,return_id,variant_id,received_quantity,good_quantity,damaged_quantity,stock_before,stock_after from store.return_receipt_items where return_item_id=:id")
                .setParameter("id",fixture.a()).executeUpdate();
        })).isInstanceOf(RuntimeException.class);
        stock(fixture,8,5);
        tx.executeWithoutResult(ignored->{
            assertThat(em.find(ReturnReceipt.class,fixture.request()).getInspectedAt()).isNull();
            assertThat(em.find(ReturnReceiptItem.class,fixture.a()).getGoodQuantity()).isNull();
        });
        inventory.restock(fixture.request(),restock(fixture)); stock(fixture,10,5);
    }
    private List<Integer> race(Long first,Runnable firstAction,Long second,Runnable secondAction) throws Exception {
        var ready=new CountDownLatch(2); var go=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var futures=new ArrayList<Future<Integer>>();
            for(int index=0;index<2;index++) { final int current=index; futures.add(pool.submit(()->{
                var context=SecurityContextHolder.createEmptyContext(); context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated("admin",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN")))); SecurityContextHolder.setContext(context);
                try {
                    tx.executeWithoutResult(ignored->{
                        em.find(ReturnRequest.class,current==0?first:second); em.find(ProductVariant.class,fixture.firstVariant());
                        ready.countDown(); try { if(!go.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Start timeout"); }
                        catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                        (current==0?firstAction:secondAction).run();
                    }); return 200;
                } catch(ResponseStatusException e) { return e.getStatusCode().value(); }
                finally { SecurityContextHolder.clearContext(); }
            })); }
            boolean started=ready.await(10,TimeUnit.SECONDS); go.countDown(); assertThat(started).isTrue();
            return List.of(futures.get(0).get(30,TimeUnit.SECONDS),futures.get(1).get(30,TimeUnit.SECONDS));
        }
    }
    private Fixture seed(Fixture shared) {
        return tx.execute(ignored->{
            if(em.createQuery("select count(u) from User u where u.username='admin'",Long.class).getSingleResult()==0) em.persist(User.builder().username("admin").email("admin@example.test").role(UserRole.ADMIN).passwordHash("hash").build());
            String unique=UUID.randomUUID().toString(); var user=User.builder().username(unique).email(unique+"@example.test").passwordHash("hash").build(); em.persist(user);
            ProductVariant first,second;
            if(shared==null) { var product=Product.builder().title("Concurrency test").build(); em.persist(product);
                first=ProductVariant.builder().product(product).title("First").stockQuantity(8).price(BigDecimal.TEN).build(); em.persist(first);
                second=ProductVariant.builder().product(product).title("Second").stockQuantity(5).price(BigDecimal.TEN).build(); em.persist(second);
            } else { first=em.find(ProductVariant.class,shared.firstVariant()); second=em.find(ProductVariant.class,shared.secondVariant()); }
            var order=Order.builder().user(user).status(OrderStatus.DELIVERED).isPaid(true).totalAmount(BigDecimal.valueOf(60)).build(); em.persist(order);
            var a=OrderDetail.builder().order(order).variant(first).quantity(3).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.valueOf(30)).build(); em.persist(a);
            var b=OrderDetail.builder().order(order).variant(second).quantity(3).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.valueOf(30)).build(); em.persist(b);
            var request=ReturnRequest.builder().order(order).user(user).reason("Concurrent receipt").status(ReturnStatus.APPROVED).build();
            var x=ReturnRequestItem.builder().returnRequest(request).orderDetail(a).quantity(3).build(); var y=ReturnRequestItem.builder().returnRequest(request).orderDetail(b).quantity(3).build(); request.getItems().addAll(List.of(x,y)); em.persist(request);
            return new Fixture(request.getReturnID(),x.getReturnItemID(),y.getReturnItemID(),first.getVariantID(),second.getVariantID());
        });
    }
    private ReceiveReturnRequest receive(Fixture f) { return new ReceiveReturnRequest(List.of(new ReceiveReturnRequest.Item(f.a(),BigDecimal.valueOf(3)),new ReceiveReturnRequest.Item(f.b(),BigDecimal.ONE))); }
    private RestockReturnRequest restock(Fixture f) { return new RestockReturnRequest(List.of(new RestockReturnRequest.Item(f.a(),BigDecimal.valueOf(2),BigDecimal.ONE),new RestockReturnRequest.Item(f.b(),BigDecimal.ZERO,BigDecimal.ONE)),"Checked"); }
    private void stock(Fixture f,int x,int y) { tx.executeWithoutResult(ignored->{
        assertThat(em.find(ProductVariant.class,f.firstVariant()).getStockQuantity()).isEqualTo(x); assertThat(em.find(ProductVariant.class,f.secondVariant()).getStockQuantity()).isEqualTo(y);
        var order=em.find(ReturnRequest.class,f.request()).getOrder(); assertThat(order.getIsPaid()).isTrue(); assertThat(order.getTotalAmount()).isEqualByComparingTo("60"); assertThat(order.getStatus()).isEqualTo(OrderStatus.DELIVERED);
    }); }
}
