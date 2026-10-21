# Lambda container image para la API de ACDAN SAT (on-demand).
# El worker Fargate usa Dockerfile.worker; aquí solo corre la API, sin Chromium.

FROM public.ecr.aws/lambda/java:21

COPY build/libs/acdan-sat-backend-aws-lambda.jar /var/task/lib/app.jar

# Koupper busca la configuración de colas en el directorio de trabajo (/var/task).
# Sin este archivo, dispatchToQueue falla con:
# "No job configurations found in context: /var/task".
COPY jobs.sqs.json /var/task/jobs.json

CMD ["com.acdan.sat.handlers.ApiGatewayEntryPoint::handleRequest"]
