package com.example.backend.deployment;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

class PostgresMigrationTest {
    @Test
    void v3KeepsOldApprovedRequestsUnreceivedAndPreservesTheirOriginalOrders() {
        // Keep H2's migration connection alive while exercising enum CHECK constraints.
        var dataSource = new org.springframework.jdbc.datasource.SingleConnectionDataSource("jdbc:h2:mem:migration-v3-upgrade;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "", true);
        try {
            var jdbc = new JdbcTemplate(dataSource);
            var before = Flyway.configure().dataSource(dataSource).schemas("store").defaultSchema("store").locations("classpath:db/migration").target("2").cleanDisabled(true).load();
            before.migrate();
            jdbc.update("insert into store.users(user_id,username,email,password_hash,role,is_active) values (1000,'old-user','old@example.test','hash','CUSTOMER',true)");
            jdbc.update("insert into store.orders(order_id,user_id,status,is_paid,total_amount) values (2000,1000,'DELIVERED',true,120000)");
            jdbc.update("insert into store.return_requests(return_id,order_id,user_id,reason,status,created_at) values (3000,2000,1000,'Old approved request','APPROVED',CURRENT_TIMESTAMP)");
            var latest = Flyway.configure().dataSource(dataSource).schemas("store").defaultSchema("store").locations("classpath:db/migration").cleanDisabled(true).load();
            assertThat(latest.migrate().migrationsExecuted).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from store.return_receipts", Long.class)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from store.return_receipt_items", Long.class)).isZero();
            assertThat(jdbc.queryForObject("select status from store.return_requests where return_id=3000", String.class)).isEqualTo("APPROVED");
            assertThat(jdbc.queryForObject("select total_amount from store.orders where order_id=2000", java.math.BigDecimal.class)).isEqualByComparingTo("120000");
            assertThatThrownBy(() -> jdbc.update("insert into store.return_receipts(return_id,received_at,received_by) values (9999,CURRENT_TIMESTAMP,1000)"))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThat(latest.migrate().migrationsExecuted).isZero();
        } finally { dataSource.destroy(); }
    }
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
        assertThat(latest.migrate().migrationsExecuted).isEqualTo(2);
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
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(3);
        assertThat(jdbc.queryForObject("select content from public.stationery_vectors_gemini where id=1", String.class))
                .isEqualTo("preserve-existing-vector");
        assertThatThrownBy(() -> jdbc.update("insert into store.cart_items(variant_id, quantity, cart_id) values (999, 1, 999)"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThatThrownBy(flyway::clean).hasMessageContaining("cleanDisabled");
    }
}
