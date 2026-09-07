# Evidencia de verificación — 2026-09-07

## Resultado automatizado

- 33 pruebas unitarias y de integración aprobadas.
- Cobertura total: 98,60 % de líneas, 92,95 % de ramas y 90,91 % de funciones.
- 24 recorridos de navegador en escritorio y móvil, con comprobaciones de accesibilidad.
- `npm audit --audit-level=high`: 0 vulnerabilidades.
- Esquema real de ambas listas verificado mediante Microsoft Graph.

## Integración real

Se ejecutó una recepción marcada claramente como **PRUEBA TECNICA APP V2 / SIN VALIDEZ OPERATIVA**. El flujo devolvió aceptación, creó la cabecera ID 12, creó un ítem `NO_OK`, adjuntó un JPEG, dejó `FotosCount = 1` y `Attachments = true`, y terminó con `status = complete` y `emailState = sent`.

También se verificó que:

- un hallazgo sin foto devuelve 422 y no se procesa;
- un comprobante con clave incorrecta devuelve 403;
- repetir el mismo envío devuelve el registro confirmado sin crear una segunda inspección;
- las consultas de estado no exponen el contenido de la inspección;
- la interfaz no presenta éxito mientras el correo o el guardado estén pendientes o fallidos.

Los registros de ejecución del flujo resultaron `Succeeded`. La prueba real envió el correo únicamente al destinatario fijo `jcastro@tackertools.com`.

Para la versión 2.1 se ejecutó una recepción adicional marcada **PRUEBA LISTAS APP V2.1 / SIN VALIDEZ OPERATIVA**. El flujo creó la cabecera ID 14 y un detalle `N/A`; Microsoft Graph confirmó `Equipo = TKR-11`, `Operadora = Pampa Energía`, `AppVersion = 2.1.0` y la relación del detalle con la cabecera. El resultado final fue `status = complete` y `emailState = sent`.

La columna remota `Operadora` quedó verificada con las 12 opciones del manifiesto, conservando las cinco opciones anteriores. El flujo temporal usado para aplicar el cambio de esquema se eliminó después de la verificación.

Después de publicar GitHub Pages se ejecutó el recorrido completo desde la URL pública. La interfaz confirmó SharePoint y correo; se verificó la cabecera ID 13, 248 detalles, 248 `ItemId` únicos, estado inicial `SIN_REVISAR` en todos y `AppVersion = 2.0.0`. La inspección se identificó como **PRUEBA FINAL APP PUBLICADA V2 / SIN VALIDEZ OPERATIVA**.

## Alcance de las pruebas

Las pruebas cubren los cuatro estados exactos, los 248 ítems, las reglas de hallazgos y cierre, almacenamiento y normalización de fotos, exportación/importación, reanudación por comprobante, tamaños inválidos, búsqueda, impresión, concurrencia entre pestañas y ausencia de selección automática. La app no calcula estadísticas ni certifica técnicamente el equipo.
