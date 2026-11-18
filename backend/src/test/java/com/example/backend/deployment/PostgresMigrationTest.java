package com.example.backend.deployment;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

class PostgresMigrationTest {
    @Test
    void v2UpgradesAppliedV1WithoutChangingRowsOrRemovingHandleUniqueness() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:migration-v2-upgrade;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(dataSource);
        var v1 = Flyway.configure().dataSource(dataSource).schemas("store").defaultSchema("store")
                .locations("classpath:db/migration").target("1").cleanDisabled(true).load();
        assertThat(v1.migrate().migrationsExecuted).isEqualTo(1);
        jdbc.update("insert into store.products(product_id, title, handle, url) values (42, 'Existing catalog', 'existing', 'old-url')");
        var latest = Flyway.configure().dataSource(dataSource).schemas("store").defaultSchema("store")
                .locations("classpath:db/migration").cleanDisabled(true).load();
        assertThat(latest.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForMap("select product_id, title, handle, url from store.products where product_id=42"))
                .containsEntry("product_id", 42L).containsEntry("title", "Existing catalog")
                .containsEntry("handle", "existing").containsEntry("url", "old-url");
        jdbc.update("insert into store.products(title, handle, url) values ('Long catalog', ?, ?)", "h".repeat(255), "u".repeat(2000));
        assertThatThrownBy(() -> jdbc.update("insert into store.products(title, handle) values ('Duplicate', 'existing')"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(latest.migrate().migrationsExecuted).isZero();
    }

    @Test
    void migrationLeavesAnExistingPublicVectorTableUntouchedAndKeepsForeignKeys() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:migration-isolation;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("create table public.stationery_vectors_gemini (id integer primary key, content varchar(100))");
        jdbc.update("insert into public.stationery_vectors_gemini values (1, 'preserve-existing-vector')");
        var flyway = Flyway.configure().dataSource(dataSource).schemas("store").defaultSchema("store")
                .locations("classpath:db/migration").baselineOnMigrate(false).cleanDisabled(true).load();
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(2);
        assertThat(jdbc.queryForObject("select content from public.stationery_vectors_gemini where id=1", String.class))
                .isEqualTo("preserve-existing-vector");
        assertThatThrownBy(() -> jdbc.update("insert into store.cart_items(variant_id, quantity, cart_id) values (999, 1, 999)"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThatThrownBy(flyway::clean).hasMessageContaining("cleanDisabled");
    }
}
