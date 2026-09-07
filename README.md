# Checklist genérico de preauditoría — Tacker

Aplicación web para registrar inspecciones de equipos Workover, Pulling y Rig. Contiene las 248 verificaciones de las 16 secciones del documento fuente, sin estadísticas, antecedentes ni criterios técnicos agregados.

## Uso

1. Completar fecha, equipo, pozo y personal que realiza la inspección.
2. Elegir `OK`, `NO OK`, `EN PROC` o `N/A` en cada ítem que se revise.
3. Para `NO OK` y `EN PROC`, cargar obligatoriamente responsable, plazo, acción correctiva, evidencia y una foto real.
4. Para cerrar un hallazgo, completar estado final, fecha, evidencia de cierre y verificador.
5. Pulsar **Guardar en SharePoint**. La app confirma el éxito únicamente después de guardar los datos y fotos y enviar el correo a `jcastro@tackertools.com`.

No se solicita inicio de sesión. Un flujo de Power Automate recibe una estructura limitada, escribe solamente en las dos listas configuradas y usa las conexiones de SharePoint y Outlook del propietario. Las credenciales de Office nunca llegan al navegador ni al repositorio.

El borrador y las fotos se guardan en el navegador. La exportación JSON incluye las fotos y permite trasladar una copia a otro equipo. Cada cambio enviado crea una nueva copia inmutable de la inspección; el comprobante local evita duplicar el mismo envío si se pierde la respuesta.

## SharePoint

- Sitio: `https://tackersrl505.sharepoint.com/sites/WellService`
- Cabecera: **INSPECCION DE CAMPO EQ TORRE**
- Detalle: **INSPECCION DE CAMPO EQ TORRE - ITEMS**
- Relación: `RecorridaLookupId` → ID de cabecera
- Fotos: adjuntos del ítem de detalle

El [contrato de datos](docs/sharepoint-contract.md) registra los nombres internos y opciones observados. El flujo no usa los campos estadísticos existentes.

## Desarrollo y verificación

```powershell
npm ci
npm run test:coverage
npm run build
npm run test:e2e
npm audit --audit-level=high
```

`TACKER_FLOW_URL` se inyecta durante la compilación. En GitHub está configurado como secreto del workflow; el archivo fuente [config.json](public/config.json) no contiene el endpoint firmado. Para operación y publicación, consultar [deployment.md](docs/deployment.md). La evidencia de pruebas está en [testing.md](docs/testing.md).
