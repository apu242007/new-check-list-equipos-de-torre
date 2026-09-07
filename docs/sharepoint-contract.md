# Contrato de SharePoint

Inspección real realizada el 2026-09-07. Todas las operaciones contra el sitio fueron de lectura. No corresponde un manifiesto de aprovisionamiento de listas porque se reutilizan los recursos existentes sin modificar su esquema.

## Destinos verificados

| Recurso | Identificador |
| --- | --- |
| Tenant | `2003cd32-a447-4e58-b7f9-ada4dc293241` |
| Sitio WellService | `tackersrl505.sharepoint.com,905a139d-0b93-4744-ad7b-b38903199802,4e4cb417-f066-4c63-a553-a47751a15707` |
| Lista de cabeceras | `e428ab0c-7c28-4f15-95e0-1ab8d3439cff` |
| Lista de ítems | `e481391a-d38f-4fe7-9675-7130d030a100` |

## Estados

| Visible en la app | Valor en `Estado` de SharePoint |
| --- | --- |
| Sin selección | `SIN_REVISAR` |
| OK | `OK` |
| NO OK | `NO_OK` |
| EN PROC | `EN_PROC` |
| N/A | `NA` |

`EstadoFinal` es una columna distinta, con `PENDIENTE` y `CERRADO`. El cierre de un hallazgo no transforma su estado original en OK. La app requiere selección explícita de CERRADO para registrar el cierre; el valor pendiente es el mapeo de un cierre todavía no definido.

## Campos del ítem

| Dato | Columna interna |
| --- | --- |
| Clave de aplicación | `Title`: `PRE-{UUID-inspeccion}-{numero-item}` |
| Número estable en el catálogo | `ItemId` (número) |
| Sección | `Zona` |
| Condición completa a verificar | `ItemTexto` (multilínea) |
| Estado | `Estado` |
| Responsable | `Responsable` (texto, no campo de persona) |
| Fecha compromiso | `Plazo` (fecha) |
| Acción correctiva | `AccionCorrectiva` |
| Estado final | `EstadoFinal` |
| Fecha de cierre del ítem | `FechaVerif` |
| Observación y evidencia | `Observaciones` |
| Equipo | `Equipo` |
| Relación a la inspección | `RecorridaLookupId` |

`Observaciones` conserva primero la observación libre y luego un bloque `[PREAUDITORIA-GENERICA-V1]` con JSON que contiene `evidence`, `closureEvidence`, `verifiedBy` y la versión de catálogo. Esta decisión permite conservar campos separados en la app usando la columna multilínea existente. La evidencia admite descripción verificable, referencia o enlace; **no se suben adjuntos binarios ni se inventa `FotosCount`**. Las herramientas que editan esa columna deben conservar el bloque para que el formulario pueda reconstruir los campos.

## Cabecera

`Equipo`, `Operadora`, `Contrato`, `FechaRelevamiento`, `Pozo`, `AuditoriaProgramada`, `EquipoRecorrida`, `CompanyRepresentative`, `Notas`, `Cerrada`, `FechaCierre` y `AppVersion` se escriben por nombre interno. Las opciones de operadora son YPF, TotalEnergies, Vista, PAE y Otra. Locación, empresa y supervisor se conservan en un bloque identificado dentro de `Notas`. Los campos `FirmaSupervisor` y `FirmaCR` no se usan como sustituto de una firma real.

No se escriben `TotalItems`, `ItemsOK`, `ItemsNoOK`, `ItemsEnProc`, `ItemsNA`, `ItemsSinRevisar`, `PctAvance`, `Semaforo`, ni campos de reiteración. Permanecen fuera del comportamiento del checklist genérico.

## Persistencia y límites

- Un registro principal por UUID, con un registro de detalle por ítem respondido/editado. Los ítems todavía no tocados se mantienen sin selección en el catálogo local.
- Cada guardado conserva puntos de recuperación en el borrador local. Antes de repetir una creación se consulta su título determinista. Se detectan títulos duplicados y no se sobrescriben automáticamente.
- Los cambios usan `If-Match` con la versión recuperada. Ante un conflicto se detiene el envío y se conserva el borrador para exportar/reconciliar.
- Una cabecera solo se marca cerrada después de confirmar todos los ítems. Microsoft Graph no ofrece una transacción entre ambas listas: ante un fallo puede quedar una inspección abierta y parcialmente guardada, recuperable al reintentar.
- No existe restricción única sobre `Title` ni índice sobre `Recorrida` en el esquema inspeccionado. La app detecta duplicados, pero no puede garantizar exclusión distribuida entre computadoras sin cambios de esquema/backend. No se presenta el guardado como una transacción atómica.
- Las búsquedas usan `HonorNonIndexedQueriesWarningMayFailRandomly`, porque las columnas de relación/título no están indexadas. Funcionaron en las consultas de inspección; para listas grandes puede requerirse un plan separado de índices, con aprobación previa.
- Las inspecciones antiguas de otro catálogo no se cargan como si fueran de esta revisión. Abrir muestra exclusivamente registros identificados con el catálogo genérico actual.
- El esquema completo está en `sharepoint-columns.json` y `sharepoint-item-columns.json`. No contienen registros de inspección ni credenciales.

Referencias: [crear ítem](https://learn.microsoft.com/en-us/graph/api/listitem-create?view=graph-rest-1.0), [actualizar campos y ETag](https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0).
