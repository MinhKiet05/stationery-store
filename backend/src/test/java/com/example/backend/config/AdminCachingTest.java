package com.example.backend.config;

import com.example.backend.dto.coupon.*;
import com.example.backend.dto.product.ProductRequest;
import com.example.backend.dto.statistics.*;
import com.example.backend.dto.user.AdminUserFilter;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.*;
import com.example.backend.services.impl.CouponServiceImpl;
import com.example.backend.services.impl.StatisticsServiceImpl;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminCachingTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withPropertyValues("app.redis.enabled=true")
            .withUserConfiguration(CatalogCachingTest.Fixture.class, Fixture.class,
                    CatalogCache.class, CatalogCachingConfiguration.class);
    private final StatisticsDateRequest november = new StatisticsDateRequest(LocalDate.of(2026,11,1), LocalDate.of(2026,11,30));

    @AfterEach void clearSecurity() { SecurityContextHolder.clearContext(); }

    @Test void revenueRangeGroupingAndDefaultMonthHaveAccurateKeysAndDtoSerialization() {
        admin();
        runner.run(ctx -> {
            var statistics = ctx.getBean(StatisticsService.class);
            var repository = ctx.getBean(StatisticsRepository.class);
            when(repository.findDailyRevenue(any(), any())).thenReturn(List.of());
            when(repository.findMonthlyRevenue(any(), any())).thenReturn(List.of());
            statistics.getRevenue(new StatisticsDateRequest(null, null), StatisticsGroupBy.DAY);
            statistics.getRevenue(november, StatisticsGroupBy.DAY);
            verify(repository, times(1)).findDailyRevenue(november.startDate().atStartOfDay(), LocalDate.of(2026,12,1).atStartOfDay());
            statistics.getRevenue(new StatisticsDateRequest(LocalDate.of(2026,10,1), LocalDate.of(2026,10,31)), StatisticsGroupBy.DAY);
            verify(repository, times(2)).findDailyRevenue(any(), any());
            statistics.getRevenue(november, StatisticsGroupBy.MONTH);
            statistics.getRevenue(november, StatisticsGroupBy.MONTH);
            verify(repository, times(1)).findMonthlyRevenue(any(), any());
            assertThat(statistics.getRevenue(november, StatisticsGroupBy.MONTH).groupBy()).isEqualTo(StatisticsGroupBy.MONTH);
            assertThatThrownBy(() -> statistics.getRevenue(new StatisticsDateRequest(null, november.endDate()), StatisticsGroupBy.DAY))
                    .isInstanceOf(ResponseStatusException.class);
        });
    }

    @Test void populatedCacheNeverBypassesSpringMethodSecurityForCustomerOrAnonymous() {
        admin();
        runner.run(ctx -> {
            var statistics = ctx.getBean(StatisticsService.class);
            var repository = ctx.getBean(StatisticsRepository.class);
            when(repository.countOrdersByStatus(any(), any())).thenReturn(List.of());
            when(repository.countReturnRequestsByStatus(any(), any())).thenReturn(List.of());
            assertThat(statistics.getOrderStatistics(november).totalOrders()).isZero();
            statistics.getOrderStatistics(november); // EnumMap round-trip on cache hit
            verify(repository, times(1)).countOrdersByStatus(any(), any());
            principal("customer", "ROLE_CUSTOMER");
            assertThatThrownBy(() -> statistics.getOrderStatistics(november)).isInstanceOf(AccessDeniedException.class);
            SecurityContextHolder.clearContext();
            assertThatThrownBy(() -> statistics.getOrderStatistics(november)).isInstanceOf(AuthenticationCredentialsNotFoundException.class);
            principal("another-admin", "ROLE_ADMIN");
            statistics.getOrderStatistics(november); // Existing ADMIN permissions are global, shared by admins only.
            verify(repository, times(1)).countOrdersByStatus(any(), any());
        });
    }

    @Test void committedProductWritesInvalidateAdminStatisticsOnceAndRollbackKeepsCache() {
        admin();
        runner.run(ctx -> {
            var statistics = ctx.getBean(StatisticsService.class);
            var repository = ctx.getBean(StatisticsRepository.class);
            when(repository.findDailyRevenue(any(), any())).thenReturn(List.of());
            var productRepo = ctx.getBean(ProductRepository.class);
            when(productRepo.findById(1L)).thenReturn(Optional.of(Product.builder().productID(1L).title("Pen").build()));
            when(productRepo.save(any(Product.class))).thenAnswer(i -> i.getArgument(0));
            var products = ctx.getBean(ProductService.class);
            ProductRequest update = new ProductRequest("Pen", null, "", BigDecimal.TEN, null, null, null, null, null, List.of(), Set.of(), true);
            statistics.getRevenue(november, StatisticsGroupBy.DAY);
            var versions = ctx.getBean(CacheManager.class).getCache("ordinary:catalog-generation");
            String before = versions.get("admin", String.class);
            var tx = new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class));
            tx.executeWithoutResult(status -> {
                products.updateProduct(1L, update);
                status.setRollbackOnly();
            });
            assertThat(versions.get("admin", String.class)).isEqualTo(before);
            statistics.getRevenue(november, StatisticsGroupBy.DAY);
            verify(repository, times(1)).findDailyRevenue(any(), any());
            tx.executeWithoutResult(status -> {
                products.updateProduct(1L, update);
                products.updateProduct(1L, update);
                assertThat(versions.get("admin", String.class)).isEqualTo(before);
                assertThat(TransactionSynchronizationManager.getSynchronizations()).hasSize(1);
            });
            assertThat(versions.get("admin", String.class)).isNotEqualTo(before);
            statistics.getRevenue(november, StatisticsGroupBy.DAY);
            statistics.getRevenue(november, StatisticsGroupBy.DAY);
            verify(repository, times(2)).findDailyRevenue(any(), any());
        });
    }

    @Test void voucherStatsAndUserAggregatesSerializeWithoutCachingPersonalListsOrVoucherDecisions() {
        admin();
        runner.run(ctx -> {
            var coupons = ctx.getBean(AdminCouponService.class);
            var aggregateRepo = ctx.getBean(AdminCouponRepository.class);
            var filter = new AdminCouponFilter(null, null, null, null);
            when(aggregateRepo.statistics(any())).thenReturn(new AdminCouponRepository.Statistics(2, 1, 0, 3));
            coupons.statistics(filter); assertThat(coupons.statistics(filter).totalUses()).isEqualTo(3);
            verify(aggregateRepo, times(1)).statistics(any());
            var users = ctx.getBean(AdminUserService.class);
            var userRepo = ctx.getBean(AdminUserRepository.class);
            when(userRepo.statistics(any())).thenReturn(new AdminUserRepository.Statistics(20, 19, 1, 0));
            var all = new AdminUserFilter(null, null, null, null);
            users.statistics(all); assertThat(users.statistics(all).totalUsers()).isEqualTo(20);
            verify(userRepo, times(1)).statistics(any());
            users.statistics(new AdminUserFilter(null, UserRole.ADMIN, null, null));
            verify(userRepo, times(2)).statistics(any());
            users.list(all,0,10); users.list(all,0,10);
            verify(userRepo,times(2)).find(any(),eq(0),eq(10));

            var service = ctx.getBean(CouponService.class);
            var repository = ctx.getBean(CouponRepository.class);
            Coupon coupon = Coupon.builder().couponID(1L).code("TEST").discountType(DiscountType.FIXED_AMOUNT)
                    .discountValue(BigDecimal.TEN).usageLimit(1).usedCount(0).build();
            when(repository.findByCode("TEST")).thenReturn(Optional.of(coupon));
            var request = new ValidateCouponRequest("test", new BigDecimal("100"));
            service.validate(request);
            coupon.setUsedCount(1); // Fresh database state must reject even while aggregate cache is populated.
            assertThatThrownBy(() -> service.validate(request)).isInstanceOfSatisfying(ResponseStatusException.class,
                    error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
            coupon.setUsedCount(0); coupon.setMinOrderValue(new BigDecimal("200"));
            assertThatThrownBy(() -> service.validate(request)).isInstanceOf(ResponseStatusException.class);
            verify(repository, times(3)).findByCode("TEST");
            when(repository.findById(1L)).thenReturn(Optional.of(coupon));
            service.deactivate(1L);
            coupons.statistics(filter);
            verify(aggregateRepo, times(2)).statistics(any());
        });
    }

    @Test void adminKeysNormalizeFiltersKeepDateAndStatusScopeAndSkipSearchAndLists() {
        admin();
        var target = new AdminOrderService(mock(AdminOrderRepository.class));
        var clock = Clock.systemUTC();
        var first = new com.example.backend.dto.order.AdminOrderFilter(null, null, null, november.startDate(), november.endDate(), null);
        var equivalent = new com.example.backend.dto.order.AdminOrderFilter("  ", null, null, november.startDate(), november.endDate(), com.example.backend.dto.order.AdminOrderFilter.Sort.NEWEST);
        assertThat(AdminCacheKeys.read(target, "statistics", new Object[]{first}, clock).identity())
                .isEqualTo(AdminCacheKeys.read(target, "statistics", new Object[]{equivalent}, clock).identity());
        var changed = new com.example.backend.dto.order.AdminOrderFilter(null, OrderStatus.DELIVERED, true, november.startDate(), november.endDate(), null);
        assertThat(AdminCacheKeys.read(target,"statistics",new Object[]{changed},clock).identity())
                .isNotEqualTo(AdminCacheKeys.read(target,"statistics",new Object[]{first},clock).identity());
        assertThat(AdminCacheKeys.read(target,"statistics",new Object[]{new com.example.backend.dto.order.AdminOrderFilter("email@example.test",null,null,null,null,null)},clock)).isNull();
        assertThat(AdminCacheKeys.supports("AdminOrderService", "list")).isFalse();
        assertThat(AdminCacheKeys.supports("CouponServiceImpl", "validate")).isFalse();
        principal("customer", "ROLE_CUSTOMER");
        assertThatThrownBy(() -> AdminCacheKeys.read(target,"statistics",new Object[]{first},clock)).isInstanceOf(AccessDeniedException.class);
    }

    private static void admin() { principal("admin", "ROLE_ADMIN"); }
    private static void principal(String name, String role) {
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(name, null,
                List.of(new SimpleGrantedAuthority(role))));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableMethodSecurity
    static class Fixture {
        @Bean Clock statisticsClock() { return Clock.fixed(Instant.parse("2026-11-24T10:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh")); }
        @Bean StatisticsRepository statisticsRepo() { return mock(StatisticsRepository.class); }
        @Bean StatisticsService statistics(StatisticsRepository repo, Clock clock) { return new StatisticsServiceImpl(repo, clock); }
        @Bean AdminCouponRepository aggregateCoupons() { return mock(AdminCouponRepository.class); }
        @Bean AdminCouponService adminCoupons(AdminCouponRepository repo) { return new AdminCouponService(repo); }
        @Bean AdminUserRepository aggregateUsers() { return mock(AdminUserRepository.class); }
        @Bean AdminUserService adminUsers(AdminUserRepository repo, EntityManager em) { return new AdminUserService(repo, em); }
        @Bean CouponRepository coupons() { return mock(CouponRepository.class); }
        @Bean CouponService couponService(CouponRepository repo, EntityManager em) { return new CouponServiceImpl(repo, em, mock(jakarta.validation.Validator.class)); }
    }
}
