FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

COPY pom.xml .
RUN mvn -q -B dependency:go-offline

COPY java ./src/main/java
COPY resources ./src/main/resources

RUN mvn -q -B clean package -DskipTests

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /app/target/msme-cashflow-guard.jar app.jar

ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
