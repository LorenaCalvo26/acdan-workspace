# CFDI: consultas verificadas

## Integración mensual

La corrida final `af9c6dee-de0e-4b4c-bfae-2538dc315891` terminó en `listo`, con
**190 registros procesados y cero errores**: 79 Emitidas y 111 Recibidas.
Las 79 Emitidas y 110 Recibidas tienen XML y PDF validados. La Recibida cancelada
solo ofrece acuse; se conservaron también los acuses disponibles.

- Metadatos en `ACDAN_DOCS`, claves idempotentes por RFC/mes/vista/folio.
- Archivos en `backend/cfdi-storage/{RFC}/{mes}/{vista}/`, fuera del directorio
  público `/pdfs`; acceso mediante API con sesión y validación del RFC.
- Programador local horario y tick EventBridge: consulta meses cerrados en
  `America/Mexico_City`, desde el mes de alta; reintenta meses incompletos antes
  de avanzar al siguiente y omite meses ya completos.
- `cfdiMensual` permite habilitar/deshabilitar el cierre por cliente,
  independientemente de la frecuencia de la Opinión 32-D y la constancia.
- Cuando un grid alcanza 500 filas, subdivide el mes por días y, de ser necesario,
  por intervalos horarios. Un rango que aun alcanza el límite en un segundo
  queda en error explícito, nunca se declara completo.
- Tablas en el detalle del cliente y en su portal, con mes, vista, búsqueda,
  estado, clasificación fiscal y descargas por registro.
- Excel del mes con dos hojas (Emitidas/Recibidas), total numérico y clasificación.
- XML: Ingreso/Factura, Egreso/Nota de crédito, Pago/Complemento de pago,
  Nómina ordinaria/extraordinaria y Traslado. Se conserva la versión del
  complemento de nómina/pagos, método de pago y relaciones con otros UUID.
  El estado de liquidación de una factura requiere conciliar esas relaciones;
  un complemento de pago no se etiqueta automáticamente como factura pagada.

## Datos fiscales desde el XML

Cada XML custodiado se enriquece con sus datos contables en `xmlDatos` del
registro, además de `serie` y `folioComercial` en el propio documento (el UUID
sigue en `folio`). Se extraen: versión, tipo, serie/folio comercial, UUID y UUID
relacionado, fechas de emisión y timbrado, lugar de expedición, emisor y receptor
con régimen/domicilio fiscal, UsoCFDI, moneda y tipo de cambio, forma y método de
pago, exportación, conceptos y el desglose de impuestos.

- El total de trasladados y retenidos se toma del nodo global `cfdi:Impuestos`;
  el desglose por concepto solo se usa cuando ese nodo no existe, así no se
  duplican impuestos sumando ambos niveles.
- Los traslados se agrupan por impuesto y tasa (`iva16`, `iva8`, `iepsTotal`,
  `iepsPorTasa`, `ivaPorTasa`) y las retenciones por impuesto (`retIva`, `retIsr`,
  `ivaRet6`). Los impuestos locales (ISH) se toman de `implocal:ImpuestosLocales`.
- Los códigos se conservan junto con su etiqueta legible
  (`G03 - Gastos en general`, `04 - Tarjeta de crédito`, `PUE - Pago en una sola
  exhibición`, régimen del receptor). Un dato ausente queda vacío y un dato
  presente en cero queda como `0.00`; ambos casos son distinguibles.
- Folios, códigos postales y códigos se mantienen como texto, incluidos ceros
  iniciales.

Columnas de la referencia `VRR190205JL7_Emitidas_2026_09_Facturas.xlsx` que no
provienen del XML y se documentan como no inferidas: `Verificado ó Asoc.`,
`EstadoPago`, `FechaPago`, `NumCtaPago`, `Condicion de Pago`, `Combustible`,
`TotalOriginal`, `Direccion/Localidad Emisor` y `Direccion/Localidad Receptor`.
`EstadoPago`/`FechaPago` requieren conciliar los complementos de pago por UUID;
`Combustible` es un complemento que solo existe en CFDI de hidrocarburos; las
direcciones y localidades pertenecen a CFDIs 3.2 y versiones previas. No se
inventan valores: la exportación deja esas columnas vacías si el XML no las trae.

Al re-descargar o releer un XML no se crea otro registro: la clave sigue siendo
`cfdi-{rfc}-{periodo}-{vista}-{folio}`.

API (POST JSON, token en el body, igual que el portal existente):

| Ruta | Campos |
|---|---|
| `/api/v1/cfdi/listar` | `token`, `rfc`, `periodo` (`yyyy-MM`) |
| `/api/v1/cfdi/sincronizar` | `token` de personal, `rfc`, `periodo` |
| `/api/v1/cfdi/archivo` | `token`, `rfc`, `docId`, `formato` (`xml`, `pdf`, `acuse`) |
| `/api/v1/cfdi/reprocesar` | `token` de personal, `rfc`, `periodo` (re-extrae XML locales sin volver al SAT) |

Las sesiones CLIENTE solo consultan su RFC; el personal puede sincronizar.
La API devuelve registros persistidos mientras el worker informa progreso.
Los reintentos reutilizan archivos válidos y recuperan los que faltan.

Checks: `./gradlew test shadowJar`, `npm run build`, y prueba opt-in de API real
`./gradlew cfdiIntegration` con `CFDI_TEST_RFC`, `CFDI_TEST_PERIODO`,
`CFDI_TEST_EMITIDAS` y `CFDI_TEST_RECIBIDAS`. La prueba de integración verifica
registros únicos, acceso autenticado, aislamiento del RFC y PDF/XML de ambas vistas.

## Evidencia inicial de exploración

Prueba real del 8 de octubre de 2026, job `71705c15-6beb-4235-9217-45485e1b71b7`.
Periodo consultado: **septiembre de 2026**, sin filtro de estado del comprobante.

| Consulta | Filas | Vigentes | Cancelados | Columnas |
|---|---:|---:|---:|---:|
| Emitidas (`ConsultaEmisor.aspx`) | 79 | 72 | 7 | 19 |
| Recibidas (`ConsultaReceptor.aspx`) | 111 | 110 | 1 | 17 |

Se verificaron folios únicos, fechas de emisión dentro del periodo, RFC en su rol
correcto y coincidencia entre las filas del HTML y el JSON. No se detectaron
controles de paginación en estas dos capturas. El extractor captura las filas
cargadas de la página actual; estos conteos corresponden únicamente a esta prueba.

## Ejecución

Solicitud al backend local:

```http
POST /api/v1/sat/solicitar
Content-Type: application/json

{"rfc":"<RFC con CIEC registrada>","tipos":["cfdi"]}
```

El flujo usa el mes anterior al de ejecución, hace login propio del portal CFDI y
consulta ambas vistas. Exige éxito al fijar cada campo y evidencia de resultados
antes de finalizar el job. Un fallo conserva la captura para diagnóstico.

## Controles confirmados

- Modo fechas: `#ctl00_MainContent_RdoFechas`.
- Buscar CFDI: `#ctl00_MainContent_BtnBusqueda`.
- Estado: `#ctl00_MainContent_DdlEstadoComprobante`, `-1` sin filtro,
  `0` cancelados, `1` vigentes.
- Grid: `#ctl00_MainContent_tblResult`.

### Emitidas

- Inicio: `#ctl00_MainContent_CldFechaInicial2_Calendario_text` y hidden
  `#hfInicial`, formato `dd/MM/yyyy`.
- Fin: `#ctl00_MainContent_CldFechaFinal2_Calendario_text` y hidden `#hfFinal`.
- Hora inicial: `#ctl00_MainContent_CldFechaInicial2_Ddl{Hora,Minuto,Segundo}`,
  valores `0`, `0`, `0`.
- Hora final: `#ctl00_MainContent_CldFechaFinal2_Ddl{Hora,Minuto,Segundo}`,
  valores `23`, `59`, `59`.

### Recibidas

- Año: `#DdlAnio`.
- Mes: `#ctl00_MainContent_CldFecha_DdlMes`, septiembre = `9`.
- Día: `#ctl00_MainContent_CldFecha_DdlDia`, `0` vacío para consultar todo el mes.
- Hora inicial: `#ctl00_MainContent_CldFecha_Ddl{Hora,Minuto,Segundo}` = `0/0/0`.
- Hora final: `#ctl00_MainContent_CldFecha_Ddl{HoraFin,MinutoFin,SegundoFin}` = `23/59/59`.

## Columnas reales

Ambas consultas incluyen, en orden:

1. Acciones
2. Folio Fiscal
3. RFC Emisor
4. Nombre o Razón Social del Emisor
5. RFC Receptor
6. Nombre o Razón Social del Receptor
7. Fecha de Emisión
8. Fecha de Certificación
9. PAC que Certificó
10. Total
11. Efecto del Comprobante
12. Estatus de cancelación
13. Estado del Comprobante
14. Estatus de Proceso de Cancelación
15. Fecha de Solicitud de la Cancelación
16. Fecha de Cancelación
17. RFC a cuenta de terceros

Emitidas añade **Motivo** y **Folio de Sustitución**.

## Acciones de descarga

Los iconos son `span` con `onclick`, no enlaces `<a href>`. Sus IDs se repiten
por fila: el futuro downloader debe localizar primero la fila por folio.

| Control por fila | Acción observada |
|---|---|
| `BtnVerDetalle` | `AccionCfdi('Detalle.aspx?Datos=…','Detalle')` |
| `BtnDescarga` | `AccionCfdi('RecuperaCfdi.aspx?Datos=…','Recuperacion')` |
| `BtnRI` | `recuperaRepresentacionImpresa('…')` |
| `ListaFolios` | Checkbox cuyo value es el folio fiscal |
| `ListaFoliosUrl` | Hidden con parámetro completo de descarga |

La representación impresa utiliza el método WebForms
`PageMethods.RecuperaRepresentacionImpresa(datos, …)`, declarado en el HTML.
Los parámetros completos se conservan en el JSON; deben utilizarse dentro de
la sesión autenticada que los obtuvo, sin recortar ni reconstruir sus valores.

En la prueba, las 79 Emitidas y 110 Recibidas expusieron acciones de recuperación
CFDI/representación impresa. La Recibida cancelada solo expuso
`BtnRecuperaAcuseFinal` ("Recuperar acuse estatus final"), sin checkbox ni acciones
de recuperación CFDI/RI. El flujo de descargas deberá contemplar esta diferencia.
La captura inicial solo documentó las acciones. La recuperación posterior quedó
verificada en la corrida final descrita arriba.

## Evidencia local

Directorio: `backend/storage/debug/` (ignorado por git).

- `71705c15-6beb-4235-9217-45485e1b71b7-cfdi-emisor-grid.html`
- `71705c15-6beb-4235-9217-45485e1b71b7-cfdi-emisor-grid.json`
- `71705c15-6beb-4235-9217-45485e1b71b7-cfdi-emisor-grid.png`
- `71705c15-6beb-4235-9217-45485e1b71b7-cfdi-receptor-grid.html`
- `71705c15-6beb-4235-9217-45485e1b71b7-cfdi-receptor-grid.json`
- `71705c15-6beb-4235-9217-45485e1b71b7-cfdi-receptor-grid.png`

Cada JSON conserva periodo, vista, controles seleccionados, encabezados, filas,
acciones completas y controles de paginación detectados. Cada HTML conserva el
documento completo, incluidos scripts y parámetros WebForms.
