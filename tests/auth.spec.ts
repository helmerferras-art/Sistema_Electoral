import { test, expect } from '@playwright/test';

test.describe('Autenticación y C4I', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('Login exitoso con OTP Bypass', async ({ page }) => {
        await page.getByPlaceholder('[ TU NÚMERO CELULAR ]').fill('9611234567');
        await page.getByRole('button', { name: /SOLICITAR CÓDIGO DE ACCESO/i }).click();

        await page.getByPlaceholder('[ INGRESA EL CÓDIGO ]').fill('123456');
        await page.getByRole('button', { name: /VINCULAR DISPOSITIVO/i }).click();

        await expect(page.locator('.app-container')).toBeVisible({ timeout: 15000 });
    });

    test('Falla de Login con código incorrecto', async ({ page }) => {
        await page.getByPlaceholder('[ TU NÚMERO CELULAR ]').fill('9611234567');
        await page.getByRole('button', { name: /SOLICITAR CÓDIGO DE ACCESO/i }).click();

        await page.getByPlaceholder('[ INGRESA EL CÓDIGO ]').fill('000000');
        await page.getByRole('button', { name: /VINCULAR DISPOSITIVO/i }).click();

        // Check for any text indicating a failure or just that we stayed on the OTP screen
        await expect(page.getByText(/inválido|expirado|error|fallo/i).first()).toBeVisible({ timeout: 15000 });
    });
});
