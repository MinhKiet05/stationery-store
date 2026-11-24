package com.example.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.util.*;

@Component
public class TrustedClientAddress {
    private final List<IpAddressMatcher> proxies;
    public TrustedClientAddress(@Value("${app.rate-limit.trusted-proxy-cidrs:}") String cidrs) {
        proxies = Arrays.stream(cidrs.split(",")).map(String::strip).filter(s -> !s.isEmpty()).map(s -> {
            String[] parts = s.split("/", 2);
            String address = parts[0];
            if (literal(address) == null || parts.length == 2 && Integer.parseInt(parts[1]) == 0)
                throw new IllegalArgumentException("Specify actual trusted proxy IPs/CIDRs, never all addresses");
            return new IpAddressMatcher(s);
        }).toList();
    }
    public String resolve(HttpServletRequest request) {
        String peer = literal(request.getRemoteAddr());
        if (peer == null) return "unknown-peer";
        if (!trusted(peer)) return peer;
        StringBuilder headers = new StringBuilder();
        var values = request.getHeaders("X-Forwarded-For");
        while (values.hasMoreElements()) {
            if (!headers.isEmpty()) headers.append(',');
            headers.append(values.nextElement());
            if (headers.length() > 1024) return peer;
        }
        String forwarded = headers.toString();
        if (forwarded.isEmpty()) return peer;
        String[] hops = forwarded.split(",", -1);
        if (hops.length > 16) return peer;
        String current = peer;
        for (int i=hops.length-1; i>=0 && trusted(current); i--) {
            String hop = literal(hops[i].strip());
            if (hop == null) return peer;
            current = hop;
        }
        return current;
    }
    private boolean trusted(String address) { return proxies.stream().anyMatch(proxy -> proxy.matches(address)); }
    private static String literal(String value) {
        if (value == null || value.length() > 45 || !value.matches("[0-9a-fA-F:.]+")) return null;
        // Forbid hostnames and abbreviated numeric IPv4 forms, so parsing never performs DNS.
        if (!value.contains(":") && !value.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) return null;
        try { return InetAddress.getByName(value).getHostAddress(); }
        catch (java.net.UnknownHostException invalid) { return null; }
    }
}
