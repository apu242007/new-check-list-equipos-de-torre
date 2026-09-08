import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const first = (page) => page.locator('#item-1');
async function general(page) {
  await page.getByLabel('Fecha de inspección *', { exact: true }).fill('2026-09-07');
  await page.getByRole('combobox', { name: 'Equipo / Rig *', exact: true }).selectOption('TKR-01');
  await page.getByLabel('Pozo *', { exact: true }).fill('POZO-PRUEBA');
  await page
    .getByLabel('Personal que realiza la inspección *', { exact: true })
    .fill('Inspector de prueba');
}
test.beforeEach(async ({ page }) => {
  await page.route('**/config.json', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.submissionUrl = '';
    await route.fulfill({ json: config });
  });
  await page.goto('/');
  await expect(page.locator('.check-section')).toHaveCount(16);
});
test('arranca con todos los ítems en OK, cuatro opciones y sin desborde horizontal', async ({
  page,
}) => {
  await expect(first(page).getByRole('radio', { name: 'OK', exact: true })).toBeChecked();
  await expect(first(page).getByRole('radio')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/inicio-${test.info().project.name}.png`,
    fullPage: false,
  });
});
test('equipos y operadoras se eligen desde listas controladas', async ({ page }) => {
  const equipment = page.getByRole('combobox', { name: 'Equipo / Rig *', exact: true });
  const operator = page.getByRole('combobox', { name: 'Cliente / Operadora', exact: true });
  await expect(equipment).toHaveRole('combobox');
  await expect(equipment.locator('option')).toHaveCount(8);
  await equipment.selectOption('TKR-11');
  await operator.selectOption('Pampa Energía');
  await expect(equipment).toHaveValue('TKR-11');
  await expect(operator).toHaveValue('Pampa Energía');
  await page.reload();
  await expect(equipment).toHaveValue('TKR-11');
  await expect(operator).toHaveValue('Pampa Energía');
});
test('NO OK exige foto; borrar selección no borra la observación', async ({ page }) => {
  await general(page);
  await first(page).getByRole('radio', { name: 'NO OK', exact: true }).check();
  await expect(first(page).locator('.photo-input')).toHaveAttribute('required', '');
  await first(page).getByLabel('Observación', { exact: true }).fill('Fisura visible en la base.');
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.locator('#errors')).toContainText('Foto: obligatoria');
  const photo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#ab2345';
    x.fillRect(0, 0, 40, 40);
    return c.toDataURL('image/png').split(',')[1];
  });
  await first(page)
    .locator('.photo-input')
    .setInputFiles({
      name: 'evidencia.png',
      mimeType: 'image/png',
      buffer: Buffer.from(photo, 'base64'),
    });
  await expect(first(page).locator('.photo-preview img')).toBeVisible();
  await page.getByRole('button', { name: 'Validar registro', exact: true }).click();
  await expect(page.locator('#errors')).toBeHidden();
  await first(page).getByRole('button', { name: 'Quitar selección' }).click();
  await expect(first(page).getByLabel('Observación', { exact: true })).toHaveValue(
    'Fisura visible en la base.',
  );
});
test('el borrador sobrevive una recarga', async ({ page }) => {
  await first(page).getByRole('radio', { name: 'EN PROC', exact: true }).check();
  await first(page).getByLabel('Observación', { exact: true }).fill('Pendiente de revisión.');
  await page.reload();
  await expect(first(page).getByRole('radio', { name: 'EN PROC', exact: true })).toBeChecked();
  await expect(first(page).locator('[data-answer="observation"]')).toHaveValue(
    'Pendiente de revisión.',
  );
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
  await expect(page.locator('#notice')).toContainText('todavía no está configurado');
  await expect(page.locator('#document-state')).not.toContainText('guardada en SharePoint');
});
test('exportación e importación crean una copia independiente y escapan contenido', async ({
  page,
}) => {
  await page.getByLabel('Pozo *', { exact: true }).fill('<img src=x onerror=alert(1)>');
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
  await expect(page.getByLabel('Pozo *', { exact: true })).toHaveValue(
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
  await page.getByLabel('Pozo *', { exact: true }).fill('Cambio no guardado');
  await expect(page.locator('#notice')).toContainText('Exportá el borrador');
  await expect(page.getByRole('button', { name: 'Exportar borrador' })).toBeEnabled();
});
test('cierre completo no admite ítems sin revisar', async ({ page }) => {
  await general(page);
  await first(page).getByRole('button', { name: 'Quitar selección' }).click();
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
  await page.getByLabel('Pozo *', { exact: true }).focus();
  await page.keyboard.type('EQ-TECLADO');
  await expect(page.getByLabel('Pozo *', { exact: true })).toHaveValue('EQ-TECLADO');
  expect(errors).toEqual([]);
});
test('otra pestaña bloquea sobrescritura y conserva opción de exportar', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.locator('.check-section')).toHaveCount(16);
  await other.getByLabel('Pozo *', { exact: true }).fill('Cambio en otra pestaña');
  await expect(page.locator('#notice')).toContainText('otra pestaña');
  await expect(page.getByLabel('Pozo *', { exact: true })).toBeDisabled();
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
