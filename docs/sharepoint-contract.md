# Contrato de SharePoint

Esquema real inspeccionado el 2026-09-07 y operación real de escritura verificada con un registro técnico identificado como prueba. Se reutilizan las listas existentes. La columna `Operadora` se amplió conservando todas sus opciones anteriores.

## Destinos

| Recurso            | Identificador                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Tenant             | `2003cd32-a447-4e58-b7f9-ada4dc293241`                                                                  |
| Sitio WellService  | `tackersrl505.sharepoint.com,905a139d-0b93-4744-ad7b-b38903199802,4e4cb417-f066-4c63-a553-a47751a15707` |
| Lista de cabeceras | `e428ab0c-7c28-4f15-95e0-1ab8d3439cff`                                                                  |
| Lista de ítems     | `e481391a-d38f-4fe7-9675-7130d030a100`                                                                  |

## Estados

| Visible       | SharePoint `Estado` |
| ------------- | ------------------- |
| Sin selección | `SIN_REVISAR`       |
| OK            | `OK`                |
| NO OK         | `NO_OK`             |
| EN PROC       | `EN_PROC`           |
| N/A           | `NA`                |

`EstadoFinal` (`PENDIENTE`/`CERRADO`) y `FechaVerif` se completan manualmente en SharePoint; la app no los escribe.

## Cabecera

Se escriben `Title`, `Equipo`, `Operadora`, `Contrato`, `FechaRelevamiento`, `Pozo`, `AuditoriaProgramada`, `EquipoRecorrida`, `CompanyRepresentative`, `Notas`, `Cerrada`, `FechaCierre` y `AppVersion`. Locación, empresa, supervisor, estado de procesamiento y clave privada del comprobante se conservan como JSON en `Notas`.

No se escriben `TotalItems`, `ItemsOK`, `ItemsNoOK`, `ItemsEnProc`, `ItemsNA`, `ItemsSinRevisar`, `PctAvance`, `Semaforo` ni campos de reiteración.

`Equipo` se guarda como texto en SharePoint, pero la app solo admite `TKR-01`, `TKR-05`, `TKR-06`, `TKR-07`, `TKR-08`, `TKR-10` o `TKR-11`. `Operadora` es una columna de opciones con `YPF`, `PAE`, `Pluspetrol`, `Vista`, `CGC`, `Shell Argentina`, `Tecpetrol`, `CAPSA`, `PCR`, `TotalEnergies`, `Pampa Energía` y `Otra`.

## Ítems y fotos

| Dato                      | Columna interna                            |
| ------------------------- | ------------------------------------------ |
| Identificador             | `Title`: `PRE2-{UUID-envío}-{número-item}` |
| Número del catálogo       | `ItemId`                                   |
| Sección y texto canónicos | `Zona`, `ItemTexto`                        |
| Estado                    | `Estado`                                   |
| Responsable y plazo       | `Responsable`, `Plazo`                     |
| Acción correctiva         | `AccionCorrectiva`                         |
| Evidencias textuales      | `Observaciones` como JSON                  |
| Equipo                    | `Equipo`                                   |
| Relación                  | `RecorridaLookupId`                        |
| Foto                      | Adjunto JPEG y `FotosCount = 1`            |

El servidor toma sección y texto de su catálogo de 248 puntos; no confía en texto enviado por el navegador. Cada `NO_OK` o `EN_PROC` requiere una foto JPEG válida además de responsable, plazo, acción y evidencia.

## Confirmación e idempotencia

El receptor crea una copia inmutable por envío. Un UUID y una clave aleatoria almacenados en el navegador permiten consultar únicamente `processing`, `complete` o `failed`. La app presenta éxito solo cuando SharePoint terminó y Outlook informó `sent`. Repetir el mismo comprobante devuelve el registro existente y no vuelve a crearlo.

Una modificación posterior genera otra copia, preservando la anterior. El título no tiene restricción única en SharePoint; el flujo detecta colisiones existentes, aunque dos solicitudes simultáneas desde navegadores distintos no constituyen una transacción distribuida. Los errores quedan visibles y el comprobante se conserva localmente.

Los snapshots completos de columnas están en `sharepoint-columns.json` y `sharepoint-item-columns.json`; no contienen inspecciones ni credenciales.
