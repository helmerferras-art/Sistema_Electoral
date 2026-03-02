import { test, expect } from '@playwright/test';

test.describe('Navegación del C4I', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.getByPlaceholder('[ TU NÚMERO CELULAR ]').fill('9611234567');
        await page.getByRole('button', { name: /SOLICITAR CÓDIGO DE ACCESO/i }).click();
        await page.getByPlaceholder('[ INGRESA EL CÓDIGO ]').fill('123456');
        await page.getByRole('button', { name: /VINCULAR DISPOSITIVO/i }).click();
        await expect(page.locator('.app-container')).toBeVisible({ timeout: 15000 });
    });

    test('Cambio de pestañas estables', async ({ page }) => {
        // Navigate to Map
        const mapTab = page.locator('button:has-text("MAP")').first();
        await mapTab.click();
        await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });

        // Navigate to Mando
        const mandoTab = page.locator('button:has-text("MANDO")').or(page.locator('button:has-text("CENTRAL COMMAND")')).first();
        await mandoTab.click();
        await expect(page.getByText(/Centro de Inteligencia/i).or(page.getByText(/CENTRAL COMMAND/i))).toBeVisible({ timeout: 10000 });

        // Navigate to CRM
        const crmTab = page.locator('button:has-text("CRM")').or(page.locator('button:has-text("EQUIPO")')).first();
        await crmTab.click();
        // Wait for something in CRM to be visible
        await expect(page.getByPlaceholder(/Buscar/i).or(page.getByText(/Directorio/i))).toBeVisible({ timeout: 10000 });
    });
});
