import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    console.log("Checking schema for new OCR fields...");
    const { data, error } = await supabase
        .from('supporters')
        .select('clave_elector, domicilio, seccion, vigencia, birth_date')
        .limit(1);

    if (error) {
        console.error("❌ ERROR: Las columnas no existen aún.", error.message);
        console.log("Por favor, ejecuta el script 'setup_ocr.sql' en tu panel de Supabase.");
    } else {
        console.log("✅ TODO LISTO: Las columnas ya existen en la base de datos.");
    }
}

check();
