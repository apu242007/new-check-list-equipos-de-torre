# Evidencia TDD — equipos y operadoras

Fecha: 2026-09-07

## Comportamiento requerido

- `Equipo / Rig` debe ser un desplegable limitado a `TKR-01`, `TKR-05`, `TKR-06`, `TKR-07`, `TKR-08`, `TKR-10` y `TKR-11`.
- `Operadora` debe conservar las opciones existentes y sumar operadoras argentinas relevantes.
- El navegador, la validación de dominio, el contrato del flujo y SharePoint deben aplicar las mismas opciones.

## Ciclo rojo

Primero se agregaron pruebas que importaban `EQUIPMENT_OPTIONS`, verificaban las listas exactas y rechazaban un equipo arbitrario. El comando `node --test tests/domain.test.mjs` falló porque la exportación todavía no existía. Ese estado quedó registrado en el commit `9af637b`.

## Ciclo verde

Se implementaron las constantes compartidas, los desplegables, la validación y los enums del flujo. `node --test tests/domain.test.mjs tests/schema.test.mjs tests/delivery.test.mjs tests/sharepoint.test.mjs` aprobó sus 31 pruebas. El esquema remoto de SharePoint también se verificó contra la lista declarativa exacta.

La verificación completa, la cobertura y el recorrido de navegador se registran en [testing.md](testing.md).
