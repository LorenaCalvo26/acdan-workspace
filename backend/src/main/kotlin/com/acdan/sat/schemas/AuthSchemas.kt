package com.acdan.sat.schemas

// Contratos del auth. El token viaja en el body porque el router actual
// solo inyecta el DTO (sin acceso a headers) en los handlers.

data class AuthLoginRequest(
    val email: String = "",
    val password: String = ""
)

data class AuthMeRequest(
    val token: String = ""
)

data class AuthCreateUserRequest(
    val token: String = "",
    val nombre: String = "",
    val email: String = "",
    val password: String = "",
    val rol: String = "OPERADOR"
)

data class AuthListUsersRequest(
    val token: String = ""
)

data class AuthChangePasswordRequest(
    val token: String = "",
    val actual: String = "",
    val nueva: String = ""
)
