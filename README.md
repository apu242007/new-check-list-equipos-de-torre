# Checklist genérico de preauditoría — Tacker

Aplicación estática para registrar condiciones de equipos Workover / Pulling / Rig. Usa exclusivamente las verificaciones de [checklist-fuente.md](docs/checklist-fuente.md), organizadas en 16 secciones. No incluye estadísticas, dashboards, antecedentes ni criterios técnicos inventados.

## Ejecutar localmente

Requiere Node.js 18.20 o superior y npm. El workflow de publicación usa Node.js 22.

```powershell
npm ci
npm run build
npm start
```

Abrir http://localhost:4173. El servidor escucha solamente en la computadora local. `dist/` contiene la página compilada; no abrir el HTML con `file://`.

## Uso

1. Completar datos generales. Fecha, equipo, pozo y personal de inspección son obligatorios para enviar a SharePoint.
2. Seleccionar **OK**, **NO OK**, **EN PROC** o **N/A** por ítem. El estado inicial queda sin seleccionar.
3. Para **NO OK** y **EN PROC**, completar responsable, plazo, acción correctiva y evidencia. El borrador local admite trabajo incompleto; el envío lo valida.
4. Registrar el cierre del hallazgo mediante **Estado final = CERRADO**, fecha, evidencia de cierre y verificador. Se conserva el estado de inspección y los datos correctivos.
5. Usar **Guardar en SharePoint** para sincronizar. La inspección puede permanecer abierta con ítems sin revisar. El cierre de la inspección exige revisar todos y cerrar los hallazgos.

El borrador se guarda en este navegador, no equivale a un envío. Exportar JSON permite respaldarlo o transferirlo. Importar crea una copia con ID nuevo para evitar modificar el original. La impresión incluye los ítems ocultos por búsqueda y los campos de seguimiento. La copia local no reemplaza la conservación corporativa en SharePoint.

## Integración existente

Inspeccionada por Microsoft Graph el 7 de septiembre de 2026, mediante solicitudes GET:

- Sitio: https://tackersrl505.sharepoint.com/sites/WellService
- Cabecera: **INSPECCION DE CAMPO EQ TORRE**.
- Detalle: **INSPECCION DE CAMPO EQ TORRE - ITEMS**.
- Vínculo: `RecorridaLookupId` → ID de cabecera.

El [contrato de datos](docs/sharepoint-contract.md) documenta los nombres y opciones reales. El esquema se verifica antes de enviar. No se crean listas ni columnas, ni se calculan los contadores disponibles en la lista. El catálogo EXTRA no se consume: este checklist utiliza exclusivamente el documento fuente aprobado.

## Conectar Microsoft y publicar

**Estado de configuración inicial:** `public/config.json` tiene el sitio y las listas verificados; `clientId` está vacío. La aplicación funciona localmente, pero el inicio de sesión y el envío requieren registrar/configurar una aplicación propia en Microsoft Entra. La sesión de Azure CLI usada para inspeccionar el sitio no se transfiere a la página.

Ver [configuración y publicación](docs/deployment.md). El repositorio incluye la solicitud de registro y el workflow de Pages, todavía sin ejecutar remotamente. No se incluyen contraseñas, secretos ni tokens en el código.

## Verificación

```powershell
npm test
npm run test:coverage
npm run build
npm run test:e2e
npm audit --audit-level=high
```

En Windows las pruebas de navegador usan Edge instalado. En CI usan Chromium instalado por Playwright. Las pruebas de integración simulan las respuestas de Microsoft Graph; las pruebas de UI no escriben en el tenant.

Para repetir la comprobación remota de esquema con la sesión de inspección autorizada en esta PC:

```powershell
node scripts/verify-sharepoint.mjs
```

La escritura real, el consentimiento de Entra y la ejecución del workflow de GitHub Pages deben verificarse después de habilitar su configuración y autorizar esas acciones. Evidencia detallada en [docs/testing.md](docs/testing.md).
