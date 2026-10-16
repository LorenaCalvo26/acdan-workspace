package com.acdan.sat.controllers

import com.acdan.sat.schemas.AuthChangePasswordRequest
import com.acdan.sat.schemas.AuthCreateUserRequest
import com.acdan.sat.schemas.AuthListUsersRequest
import com.acdan.sat.schemas.AuthLoginRequest
import com.acdan.sat.schemas.AuthMeRequest
import com.acdan.sat.scripts.AuthChangePasswordInput
import com.acdan.sat.scripts.AuthCreateInput
import com.acdan.sat.scripts.AuthLoginInput
import com.acdan.sat.scripts.AuthTokenInput
import com.acdan.sat.scripts.changePassword
import com.acdan.sat.scripts.createUser
import com.acdan.sat.scripts.getUserInfo
import com.acdan.sat.scripts.listUsers
import com.acdan.sat.scripts.loginUser

// Fachada web de los scripts @Export de auth. No hay lógica aquí:
// solo traduce Map(statusCode, body) -> ControllerResponse.
object AuthController {

    private fun fwd(r: Map<String, Any?>): ControllerResponse =
        ControllerResponse((r["statusCode"] as? Number)?.toInt() ?: 500, r["body"]?.toString() ?: """{"error":"AUTH"}""")

    fun login(dto: AuthLoginRequest): ControllerResponse =
        fwd(loginUser(AuthLoginInput(dto.email, dto.password)))

    fun me(dto: AuthMeRequest): ControllerResponse =
        fwd(getUserInfo(AuthTokenInput(dto.token)))

    fun crearUsuario(dto: AuthCreateUserRequest): ControllerResponse =
        fwd(createUser(AuthCreateInput(dto.token, dto.nombre, dto.email, dto.password, dto.rol)))

    fun listarUsuarios(dto: AuthListUsersRequest): ControllerResponse =
        fwd(listUsers(AuthTokenInput(dto.token)))

    fun cambiarPassword(dto: AuthChangePasswordRequest): ControllerResponse =
        fwd(changePassword(AuthChangePasswordInput(dto.token, dto.actual, dto.nueva)))
}
