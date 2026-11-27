package com.example.backend.security;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import java.io.IOException;
import static org.assertj.core.api.Assertions.*;

class ReturnSubmissionTraceFilterTest {
    @Test void serverGeneratesCorrelationAndClearsItAfterSuccess() throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/returns");
        request.setServletPath("/api/returns");
        request.addHeader("X-Return-Request-ID", "untrusted-client-value");
        var response = new MockHttpServletResponse();
        new ReturnSubmissionTraceFilter().doFilter(request, response, (req, res) -> {
            assertThat(MDC.get("return_request_id")).isEqualTo(response.getHeader("X-Return-Request-ID"));
            assertThat(MDC.get("return_request_id")).matches("[0-9a-f-]{36}");
            response.setStatus(201);
        });
        assertThat(MDC.get("return_request_id")).isNull();
        assertThat(response.getStatus()).isEqualTo(201);
    }

    @Test void brokenPipeIsPropagatedAndThreadContextIsCleared() {
        var request = new MockHttpServletRequest("POST", "/api/returns");
        request.setServletPath("/api/returns");
        assertThatThrownBy(() -> new ReturnSubmissionTraceFilter().doFilter(request, new MockHttpServletResponse(),
                (req, res) -> { throw new IOException("Broken pipe"); })).isInstanceOf(IOException.class);
        assertThat(MDC.get("return_request_id")).isNull();
    }

    @Test void readOnlyHistoryDoesNotGetSubmissionTrace() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/returns/my-requests");
        request.setServletPath("/api/returns/my-requests");
        var response = new MockHttpServletResponse();
        new ReturnSubmissionTraceFilter().doFilter(request, response, (req, res) -> assertThat(MDC.get("return_request_id")).isNull());
        assertThat(response.getHeader("X-Return-Request-ID")).isNull();
    }
}
