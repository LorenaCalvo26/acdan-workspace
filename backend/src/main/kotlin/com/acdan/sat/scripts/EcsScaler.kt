package com.acdan.sat.scripts

import com.koupper.os.env
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ecs.EcsClient
import software.amazon.awssdk.services.ecs.model.AssignPublicIp
import software.amazon.awssdk.services.ecs.model.AwsVpcConfiguration
import software.amazon.awssdk.services.ecs.model.CapacityProviderStrategyItem
import software.amazon.awssdk.services.ecs.model.DesiredStatus
import software.amazon.awssdk.services.ecs.model.ListTasksRequest
import software.amazon.awssdk.services.ecs.model.NetworkConfiguration
import software.amazon.awssdk.services.ecs.model.RunTaskRequest

/**
 * Enciende un worker Fargate Spot on-demand (ECS RunTask) cuando la API encola
 * un job. El worker consume SQS, se apaga solo al quedar sin trabajo y no hay
 * servicio ni ALB encendido 24/7. Solo actúa en el API Lambda (ROLE=api); el
 * worker y el servidor local nunca se auto-lanzan.
 */
object EcsScaler {
    @Volatile
    private var ecs: EcsClient? = null

    private fun client(): EcsClient = ecs ?: synchronized(this) {
        ecs ?: EcsClient.builder()
            .region(Region.of(env("AWS_REGION", required = false, default = "us-east-2")))
            .build()
            .also { ecs = it }
    }

    fun ensureWorker() {
        if (env("ROLE", required = false, default = "all") != "api") return

        val cluster = env("ECS_CLUSTER", required = false, default = "acdan-sat")
        val taskDefinition = env("ECS_TASK_DEFINITION", required = false, default = "acdan-sat-worker-ondemand")
        val subnets = env("ECS_SUBNETS", required = false, default = "")
            .split(",").map { it.trim() }.filter { it.isNotBlank() }
        val securityGroups = env("ECS_SECURITY_GROUPS", required = false, default = "")
            .split(",").map { it.trim() }.filter { it.isNotBlank() }
        if (subnets.isEmpty() || securityGroups.isEmpty()) {
            println("[ecs] ECS_SUBNETS/ECS_SECURITY_GROUPS vacíos; no se lanza worker")
            return
        }

        runCatching {
            val activos = client().listTasks(
                ListTasksRequest.builder()
                    .cluster(cluster)
                    .family(taskDefinition)
                    .desiredStatus(DesiredStatus.RUNNING)
                    .build()
            ).taskArns()
            if (activos.isNotEmpty()) {
                println("[ecs] worker ya corriendo (${activos.size}); no se duplica")
                return@runCatching
            }

            val respuesta = client().runTask(
                RunTaskRequest.builder()
                    .cluster(cluster)
                    .taskDefinition(taskDefinition)
                    .count(1)
                    .capacityProviderStrategy(
                        CapacityProviderStrategyItem.builder()
                            .capacityProvider("FARGATE_SPOT")
                            .weight(1)
                            .build()
                    )
                    .networkConfiguration(
                        NetworkConfiguration.builder()
                            .awsvpcConfiguration(
                                AwsVpcConfiguration.builder()
                                    .subnets(subnets)
                                    .securityGroups(securityGroups)
                                    .assignPublicIp(AssignPublicIp.ENABLED)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            println("[ecs] worker lanzado: ${respuesta.tasks().map { it.taskArn() }} failures=${respuesta.failures()}")
        }.onFailure {
            println("[ecs] no se pudo lanzar worker: ${it.message}")
        }
    }
}
