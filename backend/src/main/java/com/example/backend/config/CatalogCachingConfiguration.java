package com.example.backend.config;

import com.example.backend.dto.product.CatalogCacheEntry.ProductPage;
import com.example.backend.dto.product.CatalogCacheEntry.SortOrder;
import com.example.backend.dto.product.ProductResponse;
import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.aop.Advisor;
import org.springframework.aop.support.StaticMethodMatcherPointcutAdvisor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Role;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.core.Ordered;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;

import java.lang.reflect.Method;
import java.util.Set;

@Configuration(proxyBeanMethods = false)
public class CatalogCachingConfiguration {
    private static final Set<String> SERVICES = Set.of("ProductServiceImpl", "ProductVariantServiceImpl",
            "ProductTypeServiceImpl", "VendorServiceImpl", "AdminProductService", "OrderServiceImpl",
            "ReturnInventoryService", "ReviewServiceImpl", "RecommendationServiceImpl",
            "StatisticsServiceImpl", "AdminOrderService", "AdminReviewService", "AdminReturnService",
            "AdminUserService", "AdminCouponService", "CouponServiceImpl", "ReturnRequestServiceImpl",
            "UserServiceImpl", "AuthServiceImpl");

    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    static Advisor catalogCacheAdvisor(ObjectProvider<CatalogCache> caches,
            @org.springframework.beans.factory.annotation.Qualifier("statisticsClock") ObjectProvider<java.time.Clock> clocks) {
        var transactions = new AnnotationTransactionAttributeSource();
        var writes = new ThreadLocal<java.util.Set<String>>();
        var advisor = new StaticMethodMatcherPointcutAdvisor() {
            @Override public boolean matches(Method method, Class<?> target) {
                return target.getPackageName().startsWith("com.example.backend.services")
                        && SERVICES.contains(target.getSimpleName())
                        && (transactions.getTransactionAttribute(method, target) != null
                            || target.getSimpleName().equals("RecommendationServiceImpl") && method.getName().equals("popular"));
            }
        };
        // Security advice runs first. This advice wraps service transactions so cached values
        // are detached DTOs and a standalone write has committed before invalidation executes.
        advisor.setOrder(Ordered.LOWEST_PRECEDENCE - 1);
        advisor.setAdvice((MethodInterceptor) invocation -> {
            CatalogCache cache = caches.getObject();
            String service = invocation.getThis().getClass().getSimpleName();
            var attribute = transactions.getTransactionAttribute(invocation.getMethod(), invocation.getThis().getClass());
            if (attribute != null && !attribute.isReadOnly()) {
                boolean outermost = writes.get() == null;
                if (outermost) writes.set(new java.util.HashSet<>());
                try {
                    Object result = invocation.proceed();
                    Set<String> groups = switch (service) {
                        case "ProductTypeServiceImpl" -> Set.of("products", "categories", "admin");
                        case "VendorServiceImpl" -> Set.of("products", "brands", "admin");
                        case "AdminUserService", "CouponServiceImpl", "ReturnRequestServiceImpl",
                             "UserServiceImpl", "AuthServiceImpl" -> Set.of("admin");
                        default -> Set.of("products", "admin");
                    };
                    writes.get().addAll(groups);
                    if (outermost) cache.invalidateAfterCommit(writes.get());
                    return result;
                } finally {
                    if (outermost) writes.remove();
                }
            }
            String method = invocation.getMethod().getName();
            var key = AdminCacheKeys.supports(service, method)
                    ? AdminCacheKeys.read(invocation.getThis(), method, invocation.getArguments(),
                        clocks.getIfAvailable(() -> java.time.Clock.system(java.time.ZoneId.of("Asia/Ho_Chi_Minh"))))
                    : CatalogCacheKeys.read(service, method, invocation.getArguments());
            if (key == null) return invocation.proceed();
            Object result = cache.read(key.cache(), key.identity(), () -> {
                try {
                    Object value = invocation.proceed();
                    if (value instanceof Page<?> page) {
                        @SuppressWarnings("unchecked") var content = (java.util.List<ProductResponse>) page.getContent();
                        return new ProductPage(content, page.getTotalElements(), page.getSort().stream()
                                .map(o -> new SortOrder(o.getProperty(), o.getDirection().name(), o.isIgnoreCase(), o.getNullHandling().name())).toList());
                    }
                    return value;
                } catch (RuntimeException | Error failure) { throw failure; }
                catch (Throwable failure) { throw new IllegalStateException(failure); }
            });
            if (result instanceof ProductPage page) {
                Sort sort = Sort.by(page.sort().stream().map(o -> {
                    var order = new Sort.Order(Sort.Direction.valueOf(o.direction()), o.property())
                            .with(Sort.NullHandling.valueOf(o.nullHandling()));
                    return o.ignoreCase() ? order.ignoreCase() : order;
                }).toList());
                return new PageImpl<>(page.content(), PageRequest.of(key.pageable().getPageNumber(),
                        key.pageable().getPageSize(), sort), page.total());
            }
            return result;
        });
        return advisor;
    }
}
