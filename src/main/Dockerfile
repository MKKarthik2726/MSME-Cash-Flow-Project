# ---- build stage ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---- run stage ----
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/msme-cashflow-guard.jar app.jar
ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8080
# PORT, DB_URL, DB_USERNAME, DB_PASSWORD are supplied by the hosting platform
ENTRYPOINT ["java", "-jar", "app.jar"]
