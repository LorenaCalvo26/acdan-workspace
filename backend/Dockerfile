# Dockerfile para AWS Lambda Container Image de ACDAN SAT Platform
# Incluye Java 17, Koupper Engine y Playwright (Chromium headless + dependencias Linux)

FROM mcr.microsoft.com/playwright/java:v1.44.0-jammy

# Instalar Java 17 OpenJDK si la imagen trae una versión diferente
RUN apt-get update && apt-get install -y openjdk-17-jre-headless ca-certificates && rm -rf /var/lib/apt/lists/*

# Directorio de trabajo en el contenedor
WORKDIR /var/task

# Copiar artefacto compilado shadowJar y librerías
COPY build/libs/*.jar /var/task/app.jar

# Variables de entorno por defecto para AWS Lambda
ENV HOME=/tmp/koupper-runtime
ENV USER_HOME=/tmp/koupper-runtime
ENV SAT_HEADLESS=true

# Entry point para AWS Lambda (usando el Handler de API Gateway o SQS)
CMD ["com.acdan.sat.handlers.ApiGatewayEntryPoint::handleRequest"]
