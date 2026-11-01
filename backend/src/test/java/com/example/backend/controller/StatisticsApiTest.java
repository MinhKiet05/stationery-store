package com.example.backend.controller;

import com.example.backend.config.StatisticsConfig;
import com.example.backend.dto.statistics.StatisticsDateRequest;
import com.example.backend.dto.statistics.StatisticsGroupBy;
import com.example.backend.repositories.StatisticsRepository;
import com.example.backend.repositories.UserRepository;
import com.example.backend.security.SecurityConfig;
import com.example.backend.services.StatisticsService;
import com.example.backend.services.impl.StatisticsServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitWebConfig(StatisticsApiTest.Config.class)
@TestPropertySource(properties = "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
class StatisticsApiTest {
    @Configuration
    @EnableWebSecurity
    @EnableWebMvc
    @Import({SecurityConfig.class, StatisticsConfig.class, StatisticsController.class,
            StatisticsServiceImpl.class, StatisticsExceptionHandler.class})
    static class Config {
        @Bean
        StatisticsRepository statistics() { return mock(StatisticsRepository.class); }
        @Bean
        UserRepository users() { return mock(UserRepository.class); }
    }

    @Autowired
    private WebApplicationContext context;
    @Autowired
    private StatisticsRepository repository;
    @Autowired
    private StatisticsService service;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        reset(repository);
        var sales = mock(StatisticsRepository.SalesTotals.class);
        when(sales.getRevenue()).thenReturn(BigDecimal.ZERO);
        when(sales.getDiscount()).thenReturn(BigDecimal.ZERO);
        when(repository.findSalesTotals(any(), any())).thenReturn(sales);
        when(repository.findCustomerTotals()).thenReturn(mock(StatisticsRepository.CustomerTotals.class));
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"overview", "revenue", "top-products", "orders", "customers"})
    void anonymousUsersCannotAccessStatistics(String endpoint) throws Exception {
        mvc.perform(get("/api/admin/statistics/" + endpoint)).andExpect(status().isUnauthorized());
        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"overview", "revenue", "top-products", "orders", "customers"})
    void customersCannotAccessStatistics(String endpoint) throws Exception {
        mvc.perform(get("/api/admin/statistics/" + endpoint)
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"))))
                .andExpect(status().isForbidden());
        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {"overview", "revenue", "top-products", "orders", "customers"})
    void adminCanReadAllReportsWithDefaultMonth(String endpoint) throws Exception {
        mvc.perform(get("/api/admin/statistics/" + endpoint)
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"overview", "revenue", "top-products", "orders", "customers"})
    void reversedDatesReturnCorrectBusinessMessage(String endpoint) throws Exception {
        mvc.perform(get("/api/admin/statistics/" + endpoint)
                        .param("startDate", "2026-11-03").param("endDate", "2026-11-02")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Khoảng thời gian không hợp lệ"));
        verifyNoInteractions(repository);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "revenue?startDate=bad&endDate=2026-11-02",
            "revenue?startDate=2026-02-30&endDate=2026-11-02",
            "revenue?startDate=2026-11-02", "revenue?endDate=2026-11-02",
            "revenue?groupBy=WEEK", "revenue?startDate=0000-01-01&endDate=2026-11-02",
            "revenue?startDate=2026-11-02&endDate=9999-12-31",
            "top-products?limit=0", "top-products?limit=101", "top-products?limit=abc",
            "top-products?productTypeID=-1", "top-products?productTypeID=abc",
            "top-products?sortBy=PRICE", "customers?sortBy=QUANTITY", "customers?limit=0"
    })
    void invalidParametersReturn400(String path) throws Exception {
        mvc.perform(get("/api/admin/statistics/" + path)
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").isNotEmpty());
        verifyNoInteractions(repository);
    }

    @Test
    void datesAreBoundAndEndDateIncludesWholeDay() throws Exception {
        mvc.perform(get("/api/admin/statistics/revenue")
                        .param("startDate", "2026-11-01").param("endDate", "2026-11-02").param("groupBy", "MONTH")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.startDate").value("2026-11-01"))
                .andExpect(jsonPath("$.endDate").value("2026-11-02"))
                .andExpect(jsonPath("$.totalRevenue").value(0))
                .andExpect(jsonPath("$.totalDiscount").value(0));
        verify(repository).findMonthlyRevenue(LocalDate.of(2026, 11, 1).atStartOfDay(),
                LocalDate.of(2026, 11, 3).atStartOfDay());
    }

    @Test
    @WithMockUser(roles = "CUSTOMER")
    void serviceAlsoEnforcesAdminRole() {
        assertThrows(AccessDeniedException.class,
                () -> service.getRevenue(new StatisticsDateRequest(null, null), StatisticsGroupBy.DAY));
        verifyNoInteractions(repository);
    }

    @Test
    void databaseFailureReturns503WithoutLeakingDatabaseDetails() throws Exception {
        when(repository.countOrders(any(), any()))
                .thenThrow(new DataAccessResourceFailureException("private database connection details"));
        mvc.perform(get("/api/admin/statistics/overview")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.detail").value("Không thể lấy dữ liệu thống kê"))
                .andExpect(jsonPath("$.trace").doesNotExist());
    }
}
