package com.acdan.sat.scripts

/** Etiquetas legibles de los códigos fiscales del CFDI. Un código desconocido se conserva tal cual. */
object CfdiCatalogo {
    val usoCfdi = mapOf(
        "G01" to "Adquisición de mercancías", "G02" to "Devoluciones, descuentos o bonificaciones",
        "G03" to "Gastos en general", "I01" to "Construcciones", "I02" to "Mobiliario y equipo de oficina por inversiones",
        "I03" to "Equipo de transporte", "I04" to "Equipo de computo y accesorios", "I08" to "Otra maquinaria y equipo",
        "D01" to "Honorarios médicos, dentales y gastos hospitalarios", "D02" to "Gastos médicos por incapacidad o discapacidad",
        "D03" to "Gastos funerales", "D04" to "Donativos", "D05" to "Intereses reales efectivamente pagados por créditos hipotecarios",
        "D06" to "Aportaciones voluntarias al SAR", "D07" to "Primas por seguros de gastos médicos",
        "D08" to "Gastos de transportación escolar obligatoria", "D09" to "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
        "D10" to "Pagos por servicios educativos (colegiaturas)", "P01" to "Por definir",
        "CP01" to "Pagos", "CN01" to "Nómina"
    )
    val formaPago = mapOf(
        "01" to "Efectivo", "02" to "Cheque nominativo", "03" to "Transferencia electrónica de fondos",
        "04" to "Tarjeta de crédito", "05" to "Monedero electrónico", "06" to "Dinero electrónico",
        "08" to "Vales de despensa", "28" to "Tarjeta de débito", "29" to "Tarjeta de servicios",
        "30" to "Aplicación de anticipos", "31" to "Intermediario pagos", "99" to "Por definir"
    )
    val metodoPago = mapOf("PUE" to "Pago en una sola exhibición", "PPD" to "Pago en parcialidades o diferido")
    val regimenFiscal = mapOf(
        "601" to "General de Ley Personas Morales", "603" to "Personas Morales con Fines no Lucrativos",
        "605" to "Sueldos y Salarios e Ingresos Asimilados a Salarios", "606" to "Arrendamiento",
        "607" to "Régimen de Enajenación o Adquisición de Bienes", "608" to "Demás ingresos",
        "610" to "Residentes en el Extranjero sin Establecimiento Permanente en México",
        "611" to "Ingresos por Dividendos (socios y accionistas)",
        "612" to "Personas Físicas con Actividades Empresariales y Profesionales",
        "614" to "Ingresos por intereses", "615" to "Régimen de los ingresos por obtención de premios",
        "616" to "Sin obligaciones fiscales", "620" to "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
        "621" to "Incorporación Fiscal", "622" to "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
        "623" to "Opcional para Grupos de Sociedades", "624" to "Coordinados",
        "625" to "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
        "626" to "Régimen Simplificado de Confianza"
    )
    val impuesto = mapOf("001" to "ISR", "002" to "IVA", "003" to "IEPS")
    val tipoFactor = mapOf("Tasa" to "Tasa", "Cuota" to "Cuota", "Exento" to "Exento")
    val objetoImp = mapOf("01" to "No objeto de impuesto", "02" to "Sí objeto de impuesto", "03" to "Sí objeto del impuesto y no obligado al desglose")
    val tipoComprobante = mapOf("I" to "Ingreso", "E" to "Egreso", "T" to "Traslado", "N" to "Nómina", "P" to "Pago")
    val exportacion = mapOf("01" to "No aplica", "02" to "Definitiva con clave A1", "03" to "Temporal", "04" to "Definitiva con clave distinta a A1")

    fun etiqueta(catalogo: Map<String, String>, codigo: String): String {
        val limpio = codigo.trim()
        if (limpio.isEmpty()) return ""
        val desc = catalogo[limpio] ?: catalogo[limpio.uppercase()] ?: return limpio
        return "$limpio - $desc"
    }

    /** Descripción sin el código, para columnas separadas. */
    fun descripcion(catalogo: Map<String, String>, codigo: String): String {
        val limpio = codigo.trim()
        if (limpio.isEmpty()) return ""
        return catalogo[limpio] ?: catalogo[limpio.uppercase()] ?: ""
    }
}
