# Operación y publicación

## Arquitectura conectada

La página estática envía un cuerpo JSON mediante `text/plain` a un flujo HTTP de Power Automate. El flujo valida tipos, tamaños, estados, campos obligatorios, identificadores y fotos antes de crear registros. Luego guarda una cabecera, los ítems, los adjuntos JPEG y envía el aviso a `jcastro@tackertools.com`.

El flujo desplegado se llama **WellService | Checklist generico | Recepcion publica v2**. Reutiliza las conexiones existentes del propietario para SharePoint Online y Microsoft 365 Outlook. No requiere registro de aplicación en Entra, inicio de sesión de los inspectores ni distribución de credenciales.

El receptor es público porque GitHub Pages no tiene un servidor propio. Su capacidad está acotada a esta operación: destino y correo son fijos; el cliente no puede elegir otra lista, sitio o destinatario. El endpoint firmado es visible para el navegador en la versión compilada, por lo que no debe considerarse una contraseña. Las conexiones OAuth del propietario permanecen dentro de Power Automate.

## Mantenimiento del flujo

Los archivos [build-public-flow.mjs](../scripts/build-public-flow.mjs) y [definition.json](../power-automate/definition.json) describen el flujo. El script de administración actualiza exclusivamente el flujo v2 cuyo identificador se conserva fuera del repositorio.

```powershell
node scripts/build-public-flow.mjs
python scripts/manage-public-flow.py deploy
python scripts/manage-public-flow.py runs
```

La URL de invocación se guarda bajo `%LOCALAPPDATA%\CodexSharePointInspection\flows` y nunca se imprime. Para una compilación local conectada:

```powershell
python scripts/manage-public-flow.py build
npm start
```

## GitHub Pages

El workflow `.github/workflows/pages.yml` usa el secreto `TACKER_FLOW_URL`, compila, ejecuta pruebas unitarias, auditoría y recorridos de navegador antes de publicar `dist/`.

La página esperada es:

`https://apu242007.github.io/new-check-list-equipos-de-torre/`

## Reversión

Una versión anterior de la página puede publicarse desde un commit anterior. Para detener nuevas cargas se debe apagar solamente el flujo **Recepcion publica v2**. Los registros ya guardados no se eliminan. Las listas y los demás flujos existentes no forman parte de la reversión.
