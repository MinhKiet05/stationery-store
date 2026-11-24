package com.example.backend.config;

import com.example.backend.dto.auth.LoginRequest;
import com.example.backend.dto.passwordreset.ForgotPasswordRequest;
import com.example.backend.security.*;
import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.aop.Advisor;
import org.springframework.aop.support.StaticMethodMatcherPointcutAdvisor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.*;
import org.springframework.core.Ordered;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Method;
import java.time.Duration;
import java.util.Locale;

@Configuration(proxyBeanMethods = false)
public class SecurityRateLimitingConfiguration {
    @Bean
    @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    static Advisor authRateLimitAdvisor(ObjectProvider<RequestRateLimiter> counters,
            ObjectProvider<TrustedClientAddress> addresses,
            @Value("${app.rate-limit.login-limit:5}") int loginLimit,
            @Value("${app.rate-limit.login-ip-limit:50}") int loginIpLimit,
            @Value("${app.rate-limit.login-window-seconds:300}") long loginSeconds,
            @Value("${app.rate-limit.register-limit:5}") int registerLimit,
            @Value("${app.rate-limit.register-window-seconds:900}") long registerSeconds,
            @Value("${app.rate-limit.forgot-limit:3}") int forgotLimit,
            @Value("${app.rate-limit.forgot-window-seconds:900}") long forgotSeconds,
            @Value("${app.rate-limit.reset-limit:30}") int resetLimit,
            @Value("${app.rate-limit.reset-window-seconds:60}") long resetSeconds,
            @Value("${app.password-reset.resend-seconds:60}") long resendSeconds) {
        if (loginLimit < 1 || loginIpLimit < 1 || registerLimit < 1 || forgotLimit < 1 || resetLimit < 1 || loginSeconds < 1 || registerSeconds < 1 || forgotSeconds < 1 || resetSeconds < 1 || resendSeconds < 1)
            throw new IllegalArgumentException("Security rate limits must be positive");
        var advisor = new StaticMethodMatcherPointcutAdvisor() {
            @Override public boolean matches(Method method, Class<?> target) {
                if (!target.getPackageName().equals("com.example.backend.controller")) return false;
                return target.getSimpleName().equals("AuthController") && (method.getName().equals("login") || method.getName().equals("register"))
                        || target.getSimpleName().equals("PasswordResetController") && (method.getName().equals("forgotPassword") || method.getName().equals("resetPassword"));
            }
        };
        advisor.setOrder(Ordered.LOWEST_PRECEDENCE - 10);
        advisor.setAdvice((MethodInterceptor) invocation -> {
            if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes request))
                throw RateLimitException.unavailable();
            String ip = addresses.getObject().resolve(request.getRequest());
            RequestRateLimiter limiter = counters.getObject();
            String method = invocation.getMethod().getName();
            if (method.equals("login")) {
                LoginRequest body = (LoginRequest) invocation.getArguments()[0];
                // Username lookup is case-sensitive in the existing service: retain that meaning.
                String identity = ip + "\n" + body.username().trim();
                var ipPermit = limiter.acquire("login-ip", ip, loginIpLimit, Duration.ofSeconds(loginSeconds));
                RequestRateLimiter.Permit permit;
                try { permit = limiter.acquire("login", identity, loginLimit, Duration.ofSeconds(loginSeconds)); }
                catch (RuntimeException failure) { limiter.release(ipPermit); throw failure; }
                boolean failedCredentials = false;
                try { return invocation.proceed(); }
                catch (Throwable failure) {
                    failedCredentials = failure instanceof org.springframework.security.core.AuthenticationException
                            || failure instanceof ResponseStatusException status && status.getStatusCode().value() == 401;
                    throw failure;
                } finally {
                    // Reservations also cap concurrent password checks. Only failed logins retain them.
                    if (!failedCredentials) {
                        limiter.release(permit);
                        limiter.release(ipPermit);
                    }
                }
            }
            if (method.equals("register")) {
                limiter.acquire("register", ip, registerLimit, Duration.ofSeconds(registerSeconds));
            } else if (method.equals("resetPassword")) {
                limiter.acquire("reset", ip, resetLimit, Duration.ofSeconds(resetSeconds));
            } else {
                ForgotPasswordRequest body = (ForgotPasswordRequest) invocation.getArguments()[0];
                String identity = ip + "\n" + body.email().strip().toLowerCase(Locale.ROOT);
                // Count every HTTP attempt before lookup, including unknown/inactive emails.
                var permit = limiter.acquire("forgot", ip, forgotLimit, Duration.ofSeconds(forgotSeconds));
                try { limiter.acquire("resend", identity, 1, Duration.ofSeconds(resendSeconds)); }
                catch (RuntimeException failure) { limiter.release(permit); throw failure; }
            }
            return invocation.proceed();
        });
        return advisor;
    }
}
