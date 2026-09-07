# Configuración y publicación

Estos pasos son el plan revisable de habilitación. No se ejecutaron modificaciones en Entra, permisos del sitio ni publicación remota durante el desarrollo.

## Microsoft Entra

1. En el tenant `2003cd32-a447-4e58-b7f9-ada4dc293241`, registrar una aplicación de una sola organización llamada **Tacker - Preauditoria generica equipos de torre**. La solicitud exacta está en [entra-app-request.json](entra-app-request.json).
2. Plataforma **Single-page application (SPA)**. Registrar exactamente:
   - `http://localhost:4173/redirect.html`
   - `https://apu242007.github.io/new-check-list-equipos-de-torre/redirect.html`
3. Agregar el permiso **delegado** de Microsoft Graph `Sites.Selected` y conceder consentimiento administrativo. Su ID se comprobó en el service principal de Microsoft Graph del tenant: `f89c84ef-20d0-4b54-87e9-02e856d66d53`.
4. Un administrador autorizado debe otorgar a esa aplicación el rol `write` únicamente en el sitio WellService, mediante `POST /v1.0/sites/{siteId}/permissions` con este cuerpo, sustituyendo el ID por el de la aplicación creada:

```json
{
  "roles": ["write"],
  "grantedToIdentities": [{
    "application": {
      "id": "CLIENT_ID_DE_LA_APLICACION",
      "displayName": "Tacker - Preauditoria generica equipos de torre"
    }
  }]
}
```

El usuario también debe tener acceso a las listas; el permiso delegado no aumenta sus permisos propios. No crear secretos para una SPA, no activar flujo implícito y no copiar tokens de Azure CLI a la página. El dispositivo de inspección fue solo un medio de acceso administrativo de lectura.

5. Configurar el identificador público localmente:

```powershell
node scripts/configure-client.mjs CLIENT_ID_DE_LA_APLICACION
npm run build
npm start
```

6. Probar **Conectar Microsoft** y la lectura de las listas. La app utiliza MSAL 5 con página dedicada `redirect.html` y redirect bridge compilado. No es necesario ingresar contraseñas en ningún formulario propio.
7. Con autorización para crear un registro de prueba, realizar un guardado abierto con estados OK, NO OK, EN PROC y N/A, recuperar la inspección, verificar evidencia y cierre, y comprobar conflictos de versión. Esta escritura real no está cubierta por los tests simulados.

Fuentes: [inicializar MSAL](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization), [página de redirección](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/login-user), [permisos Selected y concesión sobre un sitio](https://learn.microsoft.com/en-us/graph/permissions-selected-overview).

## GitHub Pages

Repositorio: `apu242007/new-check-list-equipos-de-torre`.

Una vez aprobada la publicación de los archivos locales:

1. Subir la rama `main` al repositorio. Revisar el diff antes del push.
2. En **Settings → Pages → Build and deployment**, seleccionar **GitHub Actions**.
3. Ejecutar el workflow **Validar y publicar checklist** o permitir que se active con el push. Compila, ejecuta pruebas y auditoría de dependencias antes de publicar únicamente `dist/`.
4. Confirmar la URL `https://apu242007.github.io/new-check-list-equipos-de-torre/` y verificar que `redirect.html` coincide exactamente con el registro SPA.
5. Comprobar móvil, conexión Microsoft, recuperación de borrador y guardado con un registro de prueba expresamente autorizado.

La URL es la prevista para este repositorio, no una afirmación de que ya esté publicada. El workflow no publica documentos internos, tests ni snapshots de esquema en el sitio Pages; el código del repositorio público sí será visible cuando se suba.

Fuente: [workflows oficiales de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Reversión

Un despliegue puede volver a una revisión previa del código. No eliminar ni recrear las listas como parte de una reversión. Los borradores JSON permiten conservar trabajo local. Si se habilita y luego se retira esta app, un administrador puede revocar específicamente su concesión sobre WellService, sin modificar permisos de otros sistemas.
