package com.example.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RequestRateLimiterTest {
    @Test void disabledRedisStillLimitsAndCountersExpireWithoutExtendingOnRejection() {
        AtomicLong now = new AtomicLong();
        var limiter = new RequestRateLimiter(null,null,"test",now::get);
        for (int i=0;i<5;i++) limiter.acquire("login","address/user",5,Duration.ofMinutes(5));
        limited(() -> limiter.acquire("login","address/user",5,Duration.ofMinutes(5)),429,300);
        now.addAndGet(Duration.ofMinutes(4).toNanos());
        limited(() -> limiter.acquire("login","address/user",5,Duration.ofMinutes(5)),429,60);
        now.addAndGet(Duration.ofMinutes(1).toNanos());
        limiter.acquire("login","address/user",5,Duration.ofMinutes(5));
    }

    @Test void successfulLoginsReleaseReservationsAndOldReleasesCannotResetNewWindow() {
        AtomicLong now = new AtomicLong();
        var limiter = new RequestRateLimiter(null,null,"test",now::get);
        for (int i=0;i<10;i++) limiter.release(limiter.acquire("login","valid",1,Duration.ofMinutes(5)));
        var old = limiter.acquire("login","valid",1,Duration.ofMinutes(5));
        now.addAndGet(Duration.ofMinutes(6).toNanos());
        limiter.acquire("login","valid",1,Duration.ofMinutes(5));
        limiter.release(old);
        limited(() -> limiter.acquire("login","valid",1,Duration.ofMinutes(5)),429,300);
    }

    @Test void concurrentRequestsAdmitExactlyTheConfiguredNumber() throws Exception {
        var limiter = new RequestRateLimiter(null,null,"test",System::nanoTime);
        try(var pool=Executors.newFixedThreadPool(8)) {
            var start = new CountDownLatch(1);
            List<Future<Boolean>> results = new ArrayList<>();
            for(int i=0;i<8;i++) results.add(pool.submit(()->{
                start.await();
                try { limiter.acquire("register","same-peer",5,Duration.ofMinutes(15)); return true; }
                catch(RateLimitException e) { assertThat(e.getStatusCode().value()).isEqualTo(429); return false; }
            }));
            start.countDown(); int allowed=0;
            for(var result:results) if(result.get(5,TimeUnit.SECONDS)) allowed++;
            assertThat(allowed).isEqualTo(5);
        }
    }

    @Test void redisFailureNeverCreatesAnIndependentLocalBudget() {
        var factory = mock(RedisConnectionFactory.class);
        when(factory.getConnection()).thenThrow(new RedisConnectionFailureException("private diagnostic"));
        var limiter = new RequestRateLimiter(new StringRedisTemplate(factory),new byte[32],"test",System::nanoTime);
        for(int i=0;i<2;i++) limited(()->limiter.acquire("login","private-user",5,Duration.ofMinutes(5)),503,5);
        limited(()->limiter.release(new RequestRateLimiter.Permit("opaque-key","generation")),503,5);
    }

    @Test void forwardedHeadersAreIgnoredUnlessEveryTrustedHopIsExplicitlyConfigured() {
        var request = new MockHttpServletRequest(); request.setRemoteAddr("203.0.113.10");
        request.addHeader("X-Forwarded-For","1.2.3.4");
        assertThat(new TrustedClientAddress("").resolve(request)).isEqualTo("203.0.113.10");
        var resolver = new TrustedClientAddress("10.0.0.9/32,10.0.0.8/32");
        request = new MockHttpServletRequest(); request.setRemoteAddr("10.0.0.9");
        request.addHeader("X-Forwarded-For","1.2.3.4, 198.51.100.10");
        request.addHeader("X-Forwarded-For","10.0.0.8");
        assertThat(resolver.resolve(request)).isEqualTo("198.51.100.10");
        request = new MockHttpServletRequest(); request.setRemoteAddr("10.0.0.9");
        request.addHeader("X-Forwarded-For","evil.example");
        assertThat(resolver.resolve(request)).isEqualTo("10.0.0.9");
        assertThatThrownBy(()->new TrustedClientAddress("0.0.0.0/00")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new TrustedClientAddress("::/0")).isInstanceOf(IllegalArgumentException.class);
    }

    static void limited(Runnable action,int status,long retryAfter) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(RateLimitException.class,error->{
            assertThat(error.getStatusCode().value()).isEqualTo(status);
            assertThat(error.retryAfter()).isEqualTo(retryAfter);
            assertThat(error.getReason()).doesNotContain("private", "diagnostic");
        });
    }
}
