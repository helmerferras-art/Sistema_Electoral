import { chromium } from 'playwright';

const network = process.argv[2] || 'facebook';
const clientId = process.argv[3];
const redirectUri = 'http://localhost:5000/callback';

const CONFIG = {
    facebook: {
        url: (id) => `https://www.facebook.com/v18.0/dialog/oauth?client_id=${id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_show_list,pages_read_engagement,pages_manage_posts&response_type=token`,
        successMatch: 'access_token='
    },
    instagram: {
        url: (id) => `https://api.instagram.com/oauth/authorize?client_id=${id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code`,
        successMatch: 'code='
    },
    tiktok: {
        url: (id) => `https://www.tiktok.com/v2/auth/authorize/?client_key=${id}&scope=user.info.basic,video.upload,video.publish&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`,
        successMatch: 'code='
    }
};

(async () => {
    console.log(`[HARVESTER] Iniciando automatización para ${network}...`);

    if (!clientId) {
        console.error("ERROR: Se requiere Client ID para iniciar el flujo de OAuth.");
        process.exit(1);
    }

    const browser = await chromium.launch({
        headless: false, // El usuario DEBE ver la ventana para loguearse
        slowMo: 50
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    const config = CONFIG[network];
    if (!config) {
        console.error("Red no soportada");
        await browser.close();
        process.exit(1);
    }

    try {
        await page.goto(config.url(clientId));
        console.log("[HARVESTER] Esperando interacción del usuario...");

        // Monitoreamos la navegación buscando el token o código en la URL
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject("Timeout esperando login"), 300000); // 5 minutos

            page.on('framenavigated', async (frame) => {
                if (frame !== page.mainFrame()) return;
                const url = frame.url();

                if (url.includes(config.successMatch)) {
                    clearTimeout(timeout);
                    resolve(url);
                }
            });
        });

        console.log("[HARVESTER] ¡Éxito! Token/Código capturado.");
        // Extraemos los parámetros de la URL
        const urlObj = new URL(result.replace('#', '?')); // Manejo para fragment tokens de FB
        const data = {};
        urlObj.searchParams.forEach((v, k) => data[k] = v);

        // Enviamos el resultado a STDOUT para que el bridge lo lea
        console.log("---RESULT_START---");
        console.log(JSON.stringify({ network, data }));
        console.log("---RESULT_END---");

    } catch (err) {
        console.error("[HARVESTER] Fallo:", err);
    } finally {
        // "Minimizar" o cerrar automáticamente
        console.log("[HARVESTER] Cerrando navegador y retornando al sistema...");
        await browser.close();
        process.exit(0);
    }
})();
