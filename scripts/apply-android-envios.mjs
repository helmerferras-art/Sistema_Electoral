// Copia las piezas nativas de "Tlatoani Envíos" a android/ y agrega los sabores play/envios a build.gradle.
import fs from 'fs';
import path from 'path';

const src = path.join('native', 'android-envios', 'app');
const dst = path.join('android', 'app');
if (!fs.existsSync(dst)) { console.error('No existe android/app. Corre primero: npx cap add android'); process.exit(1); }

const copy = (from, to) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
        const a = path.join(from, e.name), b = path.join(to, e.name);
        if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copy(a, b); }
        else { fs.copyFileSync(a, b); console.log('copiado', b); }
    }
};
copy(src, dst);

const gradle = path.join(dst, 'build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
if (!g.includes('productFlavors')) {
    g = g.replace(/(\n    buildTypes \{[\s\S]*?\n    \}\n)\}/, `$1    flavorDimensions = ["dist"]
    productFlavors {
        play { dimension "dist" }
        envios {
            dimension "dist"
            applicationIdSuffix ".envios"
            versionNameSuffix "-envios"
        }
    }
}`);
    fs.writeFileSync(gradle, g);
    console.log('sabores play/envios agregados a', gradle);
}
