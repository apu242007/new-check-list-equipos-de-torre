# Checklist de preauditoría

Crear la app desde cero, tomando exclusivamente los puntos de `checklist-fuente.md`.
La instrucción posterior del usuario reemplaza las opciones de estado del documento fuente.

## Registro por ítem

- Estado: `OK`, `NO OK`, `EN PROC`, `N/A`. Sin selección inicial ni cumplimiento automático.
- `OK`: cumple con la condición requerida.
- `NO OK`: no cumple y requiere acción correctiva.
- `EN PROC`: la corrección está en curso.
- `N/A`: no aplica al pozo o configuración actual.
- Para `NO OK` y `EN PROC`, exigir responsable, plazo de resolución, acción correctiva propuesta, evidencia y una foto real obligatoria.
- Permitir observación.
- El cierre del hallazgo (estado final, fecha, evidencia de cierre, verificado por) se completa manualmente en SharePoint; la app no lo gestiona.

## Presentación

Sin estadísticas, dashboard, gráficos, porcentajes, indicadores ni resúmenes.
Conservar los datos generales y las 16 secciones técnicas del documento fuente.
No inventar criterios técnicos ni valores de aceptación.

## Integración validada

- Sitio: https://tackersrl505.sharepoint.com/sites/WellService
- Lista: INSPECCION DE CAMPO EQ TORRE
- URL: https://tackersrl505.sharepoint.com/sites/WellService/Lists/INSPECCION%20DE%20CAMPO%20EQ%20TORRE/AllItems.aspx
- Los nombres internos, tipos, opciones, obligatoriedad y estructura de registros fueron verificados antes de implementar el mapeo.
- Un flujo de Power Automate recibe datos sin pedir credenciales al inspector y usa las conexiones de Office del propietario.
- El correo de confirmación se envía a `jcastro@tackertools.com`.
- Mantener credenciales y cachés de autenticación fuera del repositorio.
- La app web no registra una aplicación Entra ni entrega credenciales a sus usuarios.
