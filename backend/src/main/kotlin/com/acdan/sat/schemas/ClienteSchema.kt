package com.acdan.sat.schemas

import com.koupper.shared.validators.extensions.schema
import com.koupper.shared.validators.rules.NotBlank
import com.koupper.shared.validators.rules.Email
import com.koupper.shared.validators.rules.Pattern
import com.koupper.shared.validators.rules.MaxLen
import com.koupper.shared.validators.rules.MinLen

val RFC_REGEX = Regex("^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$")

fun clienteSchema() = schema<ClienteForm> {
    field("rfc", { it.rfc }) {
        +NotBlank
        +Pattern(RFC_REGEX, "invalid_rfc")
    }
    // Nombre/email son solo para tu dash (identificar al cliente y avisarle).
    // El SAT no los pide: si vienen vacíos el backend los autocompleta.
    field("nombre", { it.nombre }) { +MaxLen(120) }
    field("email", { it.email }) { +MaxLen(160) }
    field("ciec", { it.ciec }) { +NotBlank; +MinLen(8) }
}

fun bulkRowSchema() = schema<BulkClienteRow> {
    field("rfc", { it.rfc }) { +NotBlank; +Pattern(RFC_REGEX, "invalid_rfc") }
    field("ciec", { it.ciec }) { +NotBlank; +MinLen(8) }
    field("nombre", { it.nombre }) { +MaxLen(120) }
}
