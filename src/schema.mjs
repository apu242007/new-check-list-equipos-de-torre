const headerTypes = {
  Title: 'text',
  Equipo: 'text',
  Operadora: 'choice',
  Contrato: 'text',
  FechaRelevamiento: 'dateTime',
  Pozo: 'text',
  AuditoriaProgramada: 'dateTime',
  EquipoRecorrida: 'text',
  CompanyRepresentative: 'text',
  Notas: 'text',
  Cerrada: 'boolean',
  FechaCierre: 'dateTime',
  AppVersion: 'text',
};
const itemTypes = {
  Title: 'text',
  ItemId: 'number',
  Zona: 'text',
  ItemTexto: 'text',
  Estado: 'choice',
  Responsable: 'text',
  Plazo: 'dateTime',
  AccionCorrectiva: 'text',
  EstadoFinal: 'choice',
  FechaVerif: 'dateTime',
  Observaciones: 'text',
  Equipo: 'text',
  Recorrida: 'lookup',
};
export function checkColumns(headers, items, config) {
  for (const [columns, expected] of [
    [headers, headerTypes],
    [items, itemTypes],
  ]) {
    for (const [name, type] of Object.entries(expected)) {
      const field = columns.find((c) => c.name === name);
      if (!field || field.readOnly || !field[type])
        throw Error(`La columna ${name} falta o cambió de tipo. No se enviaron datos.`);
    }
    for (const field of columns)
      if (
        field.required &&
        !field.readOnly &&
        !expected[field.name] &&
        !['ContentType', 'Attachments'].includes(field.name)
      )
        throw Error(
          `SharePoint exige una columna adicional: ${field.displayName}. No se enviaron datos.`,
        );
  }
  for (const [columns, name, choices] of [
    [items, 'Estado', ['SIN_REVISAR', 'OK', 'NO_OK', 'EN_PROC', 'NA']],
    [items, 'EstadoFinal', ['PENDIENTE', 'CERRADO']],
    [headers, 'Operadora', ['YPF', 'TotalEnergies', 'Vista', 'PAE', 'Otra']],
  ]) {
    const actual = columns.find((c) => c.name === name).choice.choices;
    if (!choices.every((choice) => actual.includes(choice)))
      throw Error(`Las opciones de ${name} cambiaron. No se enviaron datos.`);
  }
  if (items.find((c) => c.name === 'Recorrida').lookup.listId !== config.headerListId)
    throw Error('El vínculo Recorrida apunta a otra lista. No se enviaron datos.');
  for (const [columns, name] of [
    [headers, 'Notas'],
    [items, 'Observaciones'],
    [items, 'ItemTexto'],
    [items, 'AccionCorrectiva'],
  ])
    if (!columns.find((c) => c.name === name).text.allowMultipleLines)
      throw Error(`La columna ${name} debe permitir varias líneas.`);
  return true;
}
export async function verifySchema(api, config) {
  const base = `sites/${encodeURIComponent(config.siteId)}/lists/`;
  const [headers, items] = await Promise.all([
    api.all(`${base}${config.headerListId}/columns`),
    api.all(`${base}${config.itemListId}/columns`),
  ]);
  return checkColumns(headers, items, config);
}
