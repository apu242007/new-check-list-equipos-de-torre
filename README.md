# Checklist genérico de preauditoría — Tacker

Aplicación web para registrar inspecciones de equipos Workover, Pulling y Rig. Contiene las 248 verificaciones de las 16 secciones del documento fuente, sin estadísticas, antecedentes ni criterios técnicos agregados.

## Uso

1. Completar fecha, seleccionar el equipo y la operadora, e indicar el pozo y el personal que realiza la inspección.
2. Todo ítem arranca en `OK`; cambiar a `NO OK`, `EN PROC` o `N/A` solo los que correspondan. "Quitar selección" deja el ítem sin estado.
3. Para `NO OK` y `EN PROC`, cargar obligatoriamente una foto real; la observación es opcional y breve.
4. Pulsar **Guardar en SharePoint**. La app arma un PDF con las 16 secciones (datos generales, estados, observaciones y miniaturas de las fotos) y lo adjunta a la cabecera junto con las fotos originales por ítem. Confirma el éxito únicamente después de guardar los datos, fotos y PDF, y de enviar el correo a `jcastro@tackertools.com`.

El seguimiento del hallazgo (responsable, plazo, acción correctiva) y su cierre (`EstadoFinal`, `FechaVerif`) se completan manualmente en SharePoint; la app no los gestiona.

No se solicita inicio de sesión. Un flujo de Power Automate recibe una estructura limitada, escribe solamente en las dos listas configuradas y usa las conexiones de SharePoint y Outlook del propietario. Las credenciales de Office nunca llegan al navegador ni al repositorio.

El borrador y las fotos se guardan en el navegador. La exportación JSON incluye las fotos y permite trasladar una copia a otro equipo. Cada cambio enviado crea una nueva copia inmutable de la inspección; el comprobante local evita duplicar el mismo envío si se pierde la respuesta.

Los equipos disponibles son `TKR-01`, `TKR-05`, `TKR-06`, `TKR-07`, `TKR-08`, `TKR-10` y `TKR-11`. Las operadoras disponibles son `YPF`, `PAE`, `Pluspetrol`, `Vista`, `CGC`, `Shell Argentina`, `Tecpetrol`, `CAPSA`, `PCR`, `TotalEnergies`, `Pampa Energía` y `Otra`.

## SharePoint

- Sitio: `https://tackersrl505.sharepoint.com/sites/WellService`
- Cabecera: **INSPECCION DE CAMPO EQ TORRE**
- Detalle: **INSPECCION DE CAMPO EQ TORRE - ITEMS**
- Relación: `RecorridaLookupId` → ID de cabecera
- Fotos: adjuntos del ítem de detalle
- PDF de la inspección: adjunto de la cabecera

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
