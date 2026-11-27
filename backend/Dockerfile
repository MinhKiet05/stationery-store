
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
# Build context is backend/, so paths never include a second backend/ prefix.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw && ./mvnw -B -ntp dependency:go-offline
COPY src/ src/
RUN ./mvnw -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
COPY --from=build --chown=app:app /build/target/backend-0.0.1-SNAPSHOT.jar /app/app.jar
USER app
# Budget a 512 MiB instance: heap <=154 MiB, metaspace <=192 MiB, code cache <=32 MiB.
# The remaining memory covers thread stacks, GC, SDK/native buffers and JVM overhead.
# Render environment variables override this default; update any JAVA_TOOL_OPTIONS override too.
ENV JAVA_TOOL_OPTIONS="-XX:InitialRAMPercentage=10 -XX:MaxRAMPercentage=30 -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=32m -Xss512k -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError"
EXPOSE 10000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
