package com.example.backend.security;

import com.example.backend.model.User;
import com.example.backend.repositories.UserRepository;
import jakarta.servlet.DispatcherType;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.Base64;
import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecretKey jwtSecret(@Value("${app.jwt.secret-base64}") String encoded) {
        byte[] key;
        try {
            key = Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("JWT secret must be Base64", e);
        }
        if (key.length < 32)
            throw new IllegalStateException("JWT secret must decode to at least 32 bytes");
        return new SecretKeySpec(key, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key, @Value("${app.jwt.issuer:stationery-store}") String issuer) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
        return decoder;
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter(UserRepository userRepository) {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        // Derive role from DB, not from a stale token claim; reject disabled accounts.
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            User user = userRepository.findByUsername(jwt.getSubject())
                    .orElseThrow(() -> new BadCredentialsException("Account not found"));
            if (!Boolean.TRUE.equals(user.getIsActive()))
                throw new BadCredentialsException("Account inactive");
            return List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
        });
        return converter;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
            JwtAuthenticationConverter converter) throws Exception {
        var paths = PathPatternRequestMatcher.withDefaults();
        var publicAuth = new OrRequestMatcher(
                paths.matcher(HttpMethod.POST, "/api/auth/register"),
                paths.matcher(HttpMethod.POST, "/api/auth/login"),
                paths.matcher(HttpMethod.POST, "/api/auth/forgot-password"),
                paths.matcher(HttpMethod.POST, "/api/auth/reset-password"));
        var bearerTokens = new DefaultBearerTokenResolver();
        return http
                .csrf(csrf -> csrf.disable()) // Bearer token via Authorization header, not cookies
                .cors(cors -> {
                })
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Preserve the original HTTP error during the container's /error dispatch.
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/ai/chat").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/recommendations/popular").permitAll()
                        .requestMatchers(publicAuth).permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/products", "/api/products/**",
                                "/api/product-variants", "/api/product-variants/**",
                                "/api/product-types", "/api/product-types/**",
                                "/api/vendors", "/api/vendors/**", "/api/tags", "/api/tags/**")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/products/*/reviews").authenticated()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers("/api/products/**", "/api/product-variants/**",
                                "/api/product-types/**", "/api/vendors/**", "/api/tags/**")
                        .hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        // permitAll is evaluated AFTER bearer authentication. Ignore stale credentials
                        // on these anonymous auth operations, using the same matcher as authorization.
                        .bearerTokenResolver(request -> publicAuth.matches(request)
                                || request.getDispatcherType() == DispatcherType.ERROR
                                        ? null
                                        : bearerTokens.resolve(request))
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(converter)))
                .build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${app.frontend.url}") String frontendUrl) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(List.of(frontendUrl.strip().replaceAll("/+$", "")));
        cors.setAllowCredentials(false); // Authentication uses the Authorization header, not cookies.
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        cors.setExposedHeaders(List.of("Content-Disposition", "Retry-After"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }
}
