package com.example.backend.config;

import com.example.backend.dto.statistics.StatisticsDateRequest;
import com.example.backend.services.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Map;

/** Cache aggregate responses only; account/order detail lists and voucher decisions stay uncached. */
final class AdminCacheKeys {
    private static final Map<String, String> CACHES = Map.of(
            "StatisticsServiceImpl.getOverview", "overview",
            "StatisticsServiceImpl.getRevenue", "revenue",
            "StatisticsServiceImpl.getTopProducts", "revenue",
            "StatisticsServiceImpl.getOrderStatistics", "orders",
            "AdminOrderService.statistics", "orders",
            "AdminReviewService.statistics", "reviews",
            "AdminReturnService.statistics", "returns",
            "AdminUserService.statistics", "users",
            "AdminProductService.statistics", "inventory",
            "AdminCouponService.statistics", "vouchers");

    static boolean supports(String service, String method) { return CACHES.containsKey(service + "." + method); }

    static CatalogCacheKeys.Key read(Object target, String method, Object[] args, Clock clock) {
        String service = target.getClass().getSimpleName();
        String suffix = CACHES.get(service + "." + method);
        if (suffix == null) return null;
        // Method security also wraps this advice. Defense in depth ensures no cache shortcut
        // can serve a regular/anonymous principal, even in a context without method-security AOP.
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getAuthorities().stream()
                .noneMatch(a -> a.getAuthority().equals("ROLE_ADMIN"))) throw new AccessDeniedException("ADMIN required");

        Object filters;
        if (service.equals("StatisticsServiceImpl")) {
            if (args[0] == null) return null; // Preserve existing validation errors.
            StatisticsDateRequest request = (StatisticsDateRequest) args[0];
            if (request.startDate() == null && request.endDate() == null) {
                LocalDate today = LocalDate.now(clock);
                request = new StatisticsDateRequest(today.withDayOfMonth(1), today.withDayOfMonth(today.lengthOfMonth()));
                args[0] = request; // Resolve once, so a request crossing midnight has one date range.
            }
            // Every argument (range, grouping, category, ranking, limit) participates in identity.
            filters = Arrays.toString(args);
        } else {
            if (args[0] == null) return null;
            filters = switch (target) {
                case AdminOrderService s -> s.filter((com.example.backend.dto.order.AdminOrderFilter) args[0]);
                case AdminReviewService s -> s.filter((com.example.backend.dto.review.AdminReviewFilter) args[0]);
                case AdminReturnService s -> s.filter((com.example.backend.dto.returns.AdminReturnFilter) args[0]);
                case AdminUserService s -> s.filter((com.example.backend.dto.user.AdminUserFilter) args[0]);
                case AdminProductService s -> s.filter((com.example.backend.dto.product.AdminProductFilter) args[0]);
                case AdminCouponService s -> s.filter((com.example.backend.dto.coupon.AdminCouponFilter) args[0]);
                default -> throw new IllegalStateException("Unsupported aggregate service");
            };
            // Avoid high-cardinality searches and storing names/emails/phone numbers in cache keys.
            boolean search = switch (target) {
                case AdminOrderService s -> ((com.example.backend.dto.order.AdminOrderFilter) args[0]).search() != null && !((com.example.backend.dto.order.AdminOrderFilter) args[0]).search().isBlank();
                case AdminReviewService s -> ((com.example.backend.dto.review.AdminReviewFilter) args[0]).search() != null && !((com.example.backend.dto.review.AdminReviewFilter) args[0]).search().isBlank();
                case AdminReturnService s -> ((com.example.backend.dto.returns.AdminReturnFilter) args[0]).search() != null && !((com.example.backend.dto.returns.AdminReturnFilter) args[0]).search().isBlank();
                case AdminUserService s -> ((com.example.backend.dto.user.AdminUserFilter) args[0]).search() != null && !((com.example.backend.dto.user.AdminUserFilter) args[0]).search().isBlank();
                case AdminProductService s -> ((com.example.backend.dto.product.AdminProductFilter) args[0]).search() != null && !((com.example.backend.dto.product.AdminProductFilter) args[0]).search().isBlank();
                case AdminCouponService s -> ((com.example.backend.dto.coupon.AdminCouponFilter) args[0]).search() != null && !((com.example.backend.dto.coupon.AdminCouponFilter) args[0]).search().isBlank();
                default -> false;
            };
            if (search) return null;
        }
        // All existing ADMIN APIs have global scope. Never include cached permissions or PII.
        String identity = "ROLE_ADMIN:GLOBAL:" + service + ":" + method + ":" + filters;
        return new CatalogCacheKeys.Key("ordinary:admin-" + suffix, identity, null);
    }
}
