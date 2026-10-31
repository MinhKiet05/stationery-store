package com.example.backend.services;

import com.example.backend.dto.user.*;
import com.example.backend.model.User;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.impl.UserServiceImpl;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder encoder = mock(PasswordEncoder.class);
    private final EntityManager em = mock(EntityManager.class);
    private final UserServiceImpl service = new UserServiceImpl(users, encoder, em);
    private User user;

    @BeforeEach
    void setup() {
        user = User.builder().userID(1L).username("customer").email("old@example.com")
                .passwordHash("old-hash").build();
        when(users.findByUsername("customer")).thenReturn(Optional.of(user));
    }

    @Test
    void profileNormalizesEmailAndNeverChangesRoleOrStatus() {
        when(users.findByEmail("new@example.com")).thenReturn(Optional.empty());
        when(users.saveAndFlush(user)).thenReturn(user);
        var response = service.updateMe("customer", new UpdateProfileRequest(
                "NEW@example.com", " Name ", " 123 ", " Address "));
        assertThat(response.email()).isEqualTo("new@example.com");
        assertThat(response.fullName()).isEqualTo("Name");
        assertThat(response.address()).isEqualTo("Address");
        assertThat(response.role()).isEqualTo(user.getRole());
        assertThat(response.isActive()).isTrue();
        verify(em).refresh(user, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void rejectsDuplicateEmailAndDatabaseRaceAsConflict() {
        when(users.findByEmail("new@example.com"))
                .thenReturn(Optional.of(User.builder().userID(2L).build()));
        assertStatus(409, () -> service.updateMe("customer",
                new UpdateProfileRequest("new@example.com", null, null, null)));
        when(users.findByEmail("new@example.com")).thenReturn(Optional.empty());
        when(users.saveAndFlush(user)).thenThrow(new DataIntegrityViolationException("duplicate"));
        assertStatus(409, () -> service.updateMe("customer",
                new UpdateProfileRequest("new@example.com", null, null, null)));
    }

    @Test
    void wrongOldPasswordDoesNotEncodeOrChangePassword() {
        assertStatus(400, () -> service.changePassword("customer", new ChangePasswordRequest("wrong", "newPassword")));
        assertThat(user.getPasswordHash()).isEqualTo("old-hash");
        verify(encoder, never()).encode(anyString());
    }

    @Test
    void passwordUsesSharedEncoderAndPreservesWhitespace() {
        when(encoder.matches("old password", "old-hash")).thenReturn(true);
        when(encoder.encode(" newPassword ")).thenReturn("new-hash");
        service.changePassword("customer", new ChangePasswordRequest("old password", " newPassword "));
        assertThat(user.getPasswordHash()).isEqualTo("new-hash");
    }

    @Test
    void rejectsBcryptOverflowForMultibytePasswords() {
        when(encoder.matches("old", "old-hash")).thenReturn(true);
        assertStatus(400, () -> service.changePassword("customer", new ChangePasswordRequest("old", "\u754c".repeat(25))));
        verify(encoder, never()).encode(anyString());
    }

    @Test
    void missingAndInactiveAccountsCannotUseSelfService() {
        assertStatus(401, () -> service.getMe(null));
        assertStatus(401, () -> service.getMe("missing"));
        user.setIsActive(false);
        assertStatus(401, () -> service.getMe("customer"));
        assertStatus(404, () -> service.getUser(999L));
    }

    @Test
    void adminCanUnlockAnInactiveAccount() {
        user.setIsActive(false);
        when(users.findById(1L)).thenReturn(Optional.of(user));
        assertThat(service.updateStatus(1L, new UpdateUserStatusRequest(true)).isActive()).isTrue();
    }

    private void assertStatus(int status, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode().value()).isEqualTo(status));
    }
}
