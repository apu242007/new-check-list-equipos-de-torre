# Evidencia de verificación — 2026-09-07

## Resultado automatizado

- 32 pruebas unitarias y de integración aprobadas.
- Cobertura total: 99,63 % de líneas, 93,06 % de ramas y 90,80 % de funciones.
- 22 recorridos de navegador en escritorio y móvil, con comprobaciones de accesibilidad.
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

## Alcance de las pruebas

Las pruebas cubren los cuatro estados exactos, los 248 ítems, las reglas de hallazgos y cierre, almacenamiento y normalización de fotos, exportación/importación, reanudación por comprobante, tamaños inválidos, búsqueda, impresión, concurrencia entre pestañas y ausencia de selección automática. La app no calcula estadísticas ni certifica técnicamente el equipo.
