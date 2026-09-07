import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const first = (page) => page.locator('#item-1');
async function general(page) {
  await page.getByLabel('Fecha de inspección *', { exact: true }).fill('2026-09-07');
  await page.getByLabel('Equipo / Rig *', { exact: true }).fill('EQ-PRUEBA');
  await page.getByLabel('Pozo *', { exact: true }).fill('POZO-PRUEBA');
  await page
    .getByLabel('Personal que realiza la inspección *', { exact: true })
    .fill('Inspector de prueba');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.check-section')).toHaveCount(16);
});
test('inicio sin estados seleccionados, cuatro opciones y sin desborde horizontal', async ({
  page,
}) => {
  await expect(page.locator('input[type=radio]:checked')).toHaveCount(0);
  await expect(first(page).getByRole('radio')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/inicio-${test.info().project.name}.png`,
    fullPage: false,
  });
});
test('NO OK muestra y exige todos los campos correctivos; borrar selección no borra evidencia', async ({
  page,
}) => {
  await general(page);
  await first(page).getByRole('radio', { name: 'NO OK', exact: true }).check();
  for (const label of [
    'Responsable',
    'Plazo de resolución',
    'Acción correctiva propuesta',
    'Evidencia / referencia documental',
  ])
    await expect(first(page).getByLabel(label, { exact: true })).toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.locator('#errors')).toContainText('Responsable: obligatorio');
  await first(page).getByLabel('Responsable', { exact: true }).fill('Supervisor');
  await first(page).getByLabel('Plazo de resolución', { exact: true }).fill('2026-09-09');
  await first(page)
    .getByLabel('Acción correctiva propuesta', { exact: true })
    .fill('Reemplazar componente');
  await first(page)
    .getByLabel('Evidencia / referencia documental', { exact: true })
    .fill('Acta de inspección 12');
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.locator('#errors')).toBeHidden();
  await first(page).getByRole('button', { name: 'Quitar selección' }).click();
  await expect(
    first(page).getByLabel('Evidencia / referencia documental', { exact: true }),
  ).toHaveValue('Acta de inspección 12');
});
test('el borrador sobrevive una recarga y el cierre conserva el hallazgo', async ({ page }) => {
  await first(page).getByRole('radio', { name: 'EN PROC', exact: true }).check();
  await first(page).getByLabel('Responsable', { exact: true }).fill('Supervisor');
  await page.reload();
  await expect(first(page).getByRole('radio', { name: 'EN PROC', exact: true })).toBeChecked();
  await expect(first(page).getByLabel('Responsable', { exact: true })).toHaveValue('Supervisor');
  await first(page).getByLabel('Estado final', { exact: true }).selectOption('CERRADO');
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.locator('#errors')).toContainText('Evidencia de cierre: obligatoria');
  await expect(first(page).getByRole('radio', { name: 'EN PROC', exact: true })).toBeChecked();
});
test('búsqueda tolera acentos y navegación revela la sección oculta', async ({ page }) => {
  await page.getByLabel('Buscar ítem').fill('mastil');
  await expect(page.locator('#item-1')).toBeVisible();
  await page.getByLabel('Buscar ítem').fill('zzzz-no-existe');
  await expect(page.locator('#no-results')).toBeVisible();
  await page.locator('#sections a[href="#section-1"]').click();
  await expect(first(page)).toBeVisible();
  await expect(page.getByLabel('Buscar ítem')).toHaveValue('');
});
test('conexión no configurada se explica y no se simula un envío', async ({ page }) => {
  await general(page);
  await page.getByRole('button', { name: 'Guardar en SharePoint', exact: false }).click();
  await expect(page.locator('#notice')).toContainText('aún no fue configurada');
  await expect(page.locator('#document-state')).not.toContainText('guardada en SharePoint');
});
test('exportación e importación crean una copia independiente y escapan contenido', async ({
  page,
}) => {
  await page.getByLabel('Equipo / Rig *', { exact: true }).fill('<img src=x onerror=alert(1)>');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar borrador' }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const old = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tacker-preauditoria-generica-v1')).id,
  );
  page.once('dialog', (d) => d.accept());
  await page.locator('#import').setInputFiles(file);
  await expect(page.locator('#notice')).toContainText('Copia importada');
  await expect(page.getByLabel('Equipo / Rig *', { exact: true })).toHaveValue(
    '<img src=x onerror=alert(1)>',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('tacker-preauditoria-generica-v1')).id,
    ),
  ).not.toBe(old);
});
test('almacenamiento lleno muestra error y permite exportar', async ({ page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await page.getByLabel('Equipo / Rig *', { exact: true }).fill('Cambio no guardado');
  await expect(page.locator('#notice')).toContainText('Exportá el borrador');
  await expect(page.getByRole('button', { name: 'Exportar borrador' })).toBeEnabled();
});
test('cierre completo no admite ítems sin revisar', async ({ page }) => {
  await general(page);
  await page.getByLabel('Declarar inspección cerrada').check();
  await page.getByLabel('Fecha de cierre de inspección', { exact: true }).fill('2026-09-07');
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.locator('#errors')).toContainText('Revisá el ítem antes de cerrar');
});
test('sin errores de JavaScript y controles accesibles por teclado', async ({ page }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload();
  await expect(page.locator('.check-section')).toHaveCount(16);
  await first(page).getByRole('radio', { name: 'NO OK', exact: true }).check();
  const report = await new AxeBuilder({ page })
    .include('.topbar')
    .include('.sidebar')
    .include('#general')
    .include('#item-1')
    .include('.savebar')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    report.violations.map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target) })),
  ).toEqual([]);
  await page.getByLabel('Equipo / Rig *', { exact: true }).focus();
  await page.keyboard.type('EQ-TECLADO');
  await expect(page.getByLabel('Equipo / Rig *', { exact: true })).toHaveValue('EQ-TECLADO');
  expect(errors).toEqual([]);
});
test('otra pestaña bloquea sobrescritura y conserva opción de exportar', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.locator('.check-section')).toHaveCount(16);
  await other.getByLabel('Equipo / Rig *', { exact: true }).fill('Cambio en otra pestaña');
  await expect(page.locator('#notice')).toContainText('otra pestaña');
  await expect(page.getByLabel('Equipo / Rig *', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Exportar borrador' })).toBeEnabled();
  await other.close();
});
test('impresión revela los ítems filtrados y restaura el filtro', async ({ page }) => {
  await page.getByLabel('Buscar ítem').fill('zzzz-no-existe');
  await expect(first(page)).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(first(page)).toBeVisible();
  await expect(first(page).locator('details')).toHaveAttribute('open', '');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(first(page)).toBeHidden();
});
