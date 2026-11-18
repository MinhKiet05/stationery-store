package com.example.backend.services;

import com.example.backend.dto.user.UpdateProfileRequest;
import com.example.backend.dto.user.ChangePasswordRequest;
import com.example.backend.dto.user.UpdateUserStatusRequest;
import com.example.backend.model.Cart;
import com.example.backend.model.User;
import com.example.backend.services.impl.UserServiceImpl;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/** H2 coverage runs by default; the PostgreSQL subclass verifies the actual production dialect. */
@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:user-profile;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.show-sql=false", "logging.level.root=WARN", "logging.level.org.hibernate.SQL=OFF"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({UserServiceImpl.class, UserProfileIntegrationTest.MethodSecurity.class})
class UserProfileIntegrationTest {
    @Autowired EntityManager em;
    @Autowired UserService users;
    @MockitoBean PasswordEncoder passwordEncoder;

    @TestConfiguration
    @EnableMethodSecurity
    static class MethodSecurity {}

    @Test
    void updatesProfileForUserWithCart() {
        verifyProfileUpdate(true);
    }

    @Test
    void updatesProfileForUserWithoutCart() {
        verifyProfileUpdate(false);
    }

    @Test
    void changesPasswordWithoutRefreshingTheCartRelationship() {
        User user = fixture(true);
        when(passwordEncoder.matches("old-password", "unchanged-test-hash")).thenReturn(true);
        when(passwordEncoder.encode("new-password")).thenReturn("new-test-hash");
        users.changePassword(user.getUsername(), new ChangePasswordRequest("old-password", "new-password"));
        em.flush();
        em.clear();
        User updated = em.find(User.class, user.getUserID());
        assertThat(updated.getPasswordHash()).isEqualTo("new-test-hash");
        assertThat(updated.getEmail()).isEqualTo("before@example.test");
        assertThat(updated.getCart()).isNotNull();
    }

    @Test
    void wrongPasswordDoesNotChangeCredentials() {
        User user = fixture(false);
        assertThatThrownBy(() -> users.changePassword(user.getUsername(),
                new ChangePasswordRequest("wrong-password", "new-password")))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
        assertThat(em.find(User.class, user.getUserID()).getPasswordHash()).isEqualTo("unchanged-test-hash");
    }

    @Test
    void rejectsDuplicateEmailWithoutChangingProfile() {
        User user = fixture(true);
        em.persist(User.builder().username("another-user").email("taken@example.test").passwordHash("test-hash").build());
        em.flush();
        em.clear();
        assertThatThrownBy(() -> users.updateMe(user.getUsername(),
                new UpdateProfileRequest("taken@example.test", "Changed", null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
        assertThat(em.find(User.class, user.getUserID()).getFullName()).isEqualTo("Tên ban đầu");
    }

    @Test
    void rejectsInactiveUserAfterReadingTheLockedRow() {
        User user = fixture(false);
        em.find(User.class, user.getUserID()).setIsActive(false);
        em.flush();
        em.clear();
        assertThatThrownBy(() -> users.updateMe(user.getUsername(),
                new UpdateProfileRequest("updated@example.test", null, null, null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(401));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminUpdatesStatusWithoutRefreshingCartOrChangingPassword() {
        User user = fixture(true);
        var response = users.updateStatus(user.getUserID(), new UpdateUserStatusRequest(false));
        assertThat(response.isActive()).isFalse();
        em.flush();
        em.clear();
        User updated = em.find(User.class, user.getUserID());
        assertThat(updated.getPasswordHash()).isEqualTo("unchanged-test-hash");
        assertThat(updated.getCart()).isNotNull();
    }

    @Test
    @WithMockUser(roles = "CUSTOMER")
    void customerCannotUpdateAccountStatus() {
        User user = fixture(false);
        assertThatThrownBy(() -> users.updateStatus(user.getUserID(), new UpdateUserStatusRequest(false)))
                .isInstanceOf(AuthorizationDeniedException.class);
        assertThat(em.find(User.class, user.getUserID()).getIsActive()).isTrue();
    }

    private void verifyProfileUpdate(boolean withCart) {
        User user = fixture(withCart);

        var response = users.updateMe(user.getUsername(), new UpdateProfileRequest(
                "updated@example.test", "  Nguyễn Văn An  ", "0900000000", "  Địa chỉ mới  "));

        assertThat(response.fullName()).isEqualTo("Nguyễn Văn An");
        assertThat(response.email()).isEqualTo("updated@example.test");
        em.flush();
        em.clear();
        User updated = em.find(User.class, user.getUserID());
        assertThat(updated.getAddress()).isEqualTo("Địa chỉ mới");
        assertThat(updated.getPasswordHash()).isEqualTo("unchanged-test-hash");
        assertThat(updated.getRole()).isEqualTo(user.getRole());
    }

    private User fixture(boolean withCart) {
        User user = User.builder().username("profile-test").email("before@example.test")
                .passwordHash("unchanged-test-hash").fullName("Tên ban đầu").build();
        em.persist(user);
        if (withCart) em.persist(Cart.builder().user(user).build());
        em.flush();
        em.clear();
        return user;
    }
}
