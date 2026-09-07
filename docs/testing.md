# Evidencia de verificación — 2026-09-07

## Resultado

- `npm test`: **26 pruebas aprobadas**, sin omisiones.
- `npm run test:e2e`: **22 pruebas aprobadas** en Edge sin interfaz, 11 recorridos en escritorio y 11 en móvil. Corrida completa final: 1,5 minutos.
- `npm run build`: compilación correcta de la app, catálogo y redirect bridge de MSAL.
- `npm audit --audit-level=high`: **0 vulnerabilidades** en el árbol instalado.
- `node scripts/verify-sharepoint.mjs`: **PASS**, columnas, tipos, opciones y relación verificados mediante GET autenticado contra WellService. Sin modificaciones remotas.
- `git diff --check`: sin errores de whitespace.

## Recorridos comprobados

| Garantía | Prueba |
| --- | --- |
| Las 248 verificaciones provienen exclusivamente de las 16 secciones de la fuente | `tests/domain.test.mjs` compara cada cantidad e ID con el documento |
| No hay cumplimiento ni selección inicial automáticos | Dominio y navegador |
| NO OK y EN PROC exigen responsable, plazo, acción y evidencia | Dominio y navegador |
| El cierre exige fecha, evidencia y verificador sin cambiar el hallazgo original | Dominio y navegador |
| Las opciones internas de SharePoint se traducen correctamente | Dominio + snapshots reales de esquema |
| Cabecera e ítems se vinculan mediante RecorridaLookupId | Cliente simulado de Graph |
| Reintento tras respuesta perdida de POST o PATCH no repite la creación confirmada | Integración simulada |
| Conflictos de versión, registro eliminado, título duplicado y respuestas inválidas no se sobrescriben automáticamente | Integración simulada |
| La cabecera se cierra únicamente después de confirmar los ítems | Integración simulada |
| Cambios de esquema detienen el envío antes de escribir | `tests/schema.test.mjs` |
| El borrador se recupera tras recargar y admite exportación/importación como copia | Navegador |
| Los valores importados se muestran como texto y no se interpretan como HTML | Navegador |
| Los errores de almacenamiento permiten exportar el borrador | Navegador |
| Otra pestaña que cambia el borrador bloquea su sobrescritura desde la anterior | Navegador |
| Búsqueda, navegación e impresión conservan todos los ítems | Navegador |
| La configuración faltante de Entra no produce un falso mensaje de envío exitoso | Navegador |

## Cobertura medida

`npm run test:coverage` usa el instrumentador de Node. Resultado final después de formatear:

| Módulo | Líneas | Ramas | Funciones |
| --- | --- | --- | --- |
| `src/domain.mjs` | 100,00 % | 98,52 % | 100,00 % |
| `src/schema.mjs` | 100,00 % | 100,00 % | 100,00 % |
| `src/sharepoint.mjs` | 98,94 % | 88,99 % | 100,00 % |

Estos porcentajes corresponden al dominio, esquema y cliente de sincronización. **No representan cobertura instrumentada de la UI ni de MSAL**. La UI se verifica mediante los recorridos E2E indicados, y el consentimiento/autenticación real de la SPA queda pendiente de su registro.

## Evidencia TDD

Los recorridos se derivaron de la solicitud del usuario y de `docs/requisitos.md`.

1. Commit `7741afb`: contratos de validación y sincronización añadidos antes de la implementación. `npm test` falló por ausencia de los módulos propios `domain.mjs` y `sharepoint.mjs`; esta fue una señal de implementación faltante, no una reproducción de un fallo de negocio en código existente.
2. Commit `ec0dde3`: implementación inicial; las 14 pruebas de ese contrato pasaron.
3. Commit `d9be045`: dos reproducciones ejecutadas y fallidas para respuesta perdida de PATCH y falta de ETag local. Resultado observado: se repetía el PATCH y no se rechazaba el registro sin versión local.
4. Corrección posterior: reconciliar campos mediante lectura, exigir la versión local para cambios y verificar la respuesta del PATCH. Las mismas reproducciones pasaron, junto con los demás casos, en la corrida final de 26 pruebas.

La UI se implementó y verificó de forma iterativa; no se afirma un ciclo RED previo para cada elemento visual. Los hallazgos de etiquetas/contraste se corrigieron y las pruebas afectadas se repitieron antes de la corrida completa.

## Verificación visual y accesibilidad

- Capturas revisadas de escritorio 1440 × 1000 y móvil 390 × 844, sin desborde horizontal.
- Axe-core: sin infracciones detectadas en cabecera, navegación, datos generales, plantilla de ítem expandida y barra de guardado, en ambos tamaños.
- Se verificó edición mediante teclado y ausencia de errores de JavaScript en el recorrido medido.
- No hay una versión visual anterior para comparar: estas capturas establecen la primera referencia; no se afirma una prueba de regresión visual contra una línea base existente.
- El análisis automatizado de accesibilidad cubre los componentes indicados; no sustituye una auditoría manual completa con lector de pantalla.

## Pendiente antes del uso conectado

La inspección real de esquema fue exitosa usando Azure CLI/Microsoft Graph. El token de esa sesión no se incorporó a la app. Faltan el Client ID propio de la SPA, consentimiento y permiso Selected sobre WellService; luego deberá comprobarse un guardado/recuperación real expresamente autorizado. Los mocks prueban el comportamiento del cliente, no sustituyen esa validación contra el servicio.

El workflow de GitHub Pages está preparado, pero no ejecutado en GitHub. No se realizó push ni publicación durante esta etapa. Plan exacto en [deployment.md](deployment.md).
