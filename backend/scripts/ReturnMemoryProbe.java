import com.example.backend.BackendApplication;
import com.google.genai.Client;
import java.lang.management.ManagementFactory;
import org.springframework.ai.google.genai.GoogleGenAiChatModel;
import org.springframework.boot.builder.SpringApplicationBuilder;

/** Local-only probe: H2, synthetic credentials, no Gemini/Cloudinary/Postgres requests. */
public class ReturnMemoryProbe {
    public static void main(String[] args) throws Exception {
        System.setProperty("spring.devtools.restart.enabled", "false");
        try (var context = new SpringApplicationBuilder(BackendApplication.class).run(
                "--spring.config.import=", "--server.address=127.0.0.1", "--server.port=0",
                "--spring.datasource.url=jdbc:h2:mem:memory-probe;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_ON_EXIT=FALSE",
                "--spring.datasource.username=sa", "--spring.datasource.password=",
                "--spring.datasource.driver-class-name=org.h2.Driver",
                "--spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
                "--app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                "--app.ai.enabled=false", "--app.ai.vector-url=", "--app.redis.enabled=false",
                "--app.mail.from=probe@example.test", "--logging.level.root=WARN")) {
            sample("boot");
            // Construct lazy AI SDK objects without invoking an embedding/chat or vector DB operation.
            try (var client = Client.builder().vertexAI(false).apiKey("synthetic-local-probe").build()) {
                var chat = GoogleGenAiChatModel.builder().genAiClient(client).build();
                Class.forName("org.springframework.ai.vectorstore.pgvector.PgVectorStore");
                Class.forName("org.postgresql.Driver");
                sample("ai_sdk_constructed");
                if (chat == null || context == null) throw new IllegalStateException();
            }
            var png = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", png);
            byte[] nearLimit = java.util.Arrays.copyOf(png.toByteArray(), 5 * 1024 * 1024 - 1);
            var file = new org.springframework.mock.web.MockMultipartFile("images", "probe.png", "image/png", nearLimit);
            var validator = context.getBean(com.example.backend.services.ReviewImageValidator.class);
            for (int count : new int[] {1, 5}) {
                long started = System.nanoTime();
                var validated = validator.validate(java.util.Collections.nCopies(count, file), 0);
                sample("validated_" + validated.size() + "_near_5mib_images");
                System.out.printf("MEMORY_PROBE validation_count=%d elapsed_ms=%d%n", count, (System.nanoTime() - started) / 1_000_000);
            }
        }
    }

    private static void sample(String phase) {
        var memory = ManagementFactory.getMemoryMXBean();
        long metaspace = ManagementFactory.getMemoryPoolMXBeans().stream()
                .filter(pool -> pool.getName().equals("Metaspace")).mapToLong(pool -> pool.getUsage().getUsed()).sum();
        System.out.printf("MEMORY_PROBE phase=%s heap_used_mib=%.1f heap_max_mib=%.1f metaspace_used_mib=%.1f loaded_classes=%d%n",
                phase, memory.getHeapMemoryUsage().getUsed() / 1048576.0,
                memory.getHeapMemoryUsage().getMax() / 1048576.0, metaspace / 1048576.0,
                ManagementFactory.getClassLoadingMXBean().getLoadedClassCount());
    }
}
