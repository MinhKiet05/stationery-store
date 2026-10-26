package com.example.backend.security;

import com.example.backend.model.User;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import java.time.Instant;

@Service
@RequiredArgsConstructor
public class JwtTokenService {
    private final JwtEncoder jwtEncoder;
    @Value("${app.jwt.issuer:stationery-store}") private String issuer;
    @Value("${app.jwt.expires-minutes:60}") private long expiresMinutes;

    public String issue(User user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
            .issuer(issuer).issuedAt(now).expiresAt(now.plusSeconds(expirySeconds()))
            .subject(user.getUsername())
            .claim("uid", user.getUserID())
            .claim("role", user.getRole().name())
            .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public long expirySeconds() {return expiresMinutes * 60;}
}
