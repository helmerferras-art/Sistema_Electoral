# Plan: Seed Strategy (Producción)

## Objetivo
Crear un entorno de datos realista para el usuario que incluya estructura piramidal y un padrón poblado de simpatizantes generados automáticamente, ubicados en Tuxtla Gutiérrez.

## Jerarquía a Crear
1. **Tenant 1 (Diputación Federal - Distrito 6)**
    - Administrador / Candidato: `candidato_fed@test.com` (Rol: candidato)
    - 1 Coordinador de Campaña (`coord_fed@test.com`) - Scope: Todo el distrito
    - 2 Coordinadores Territoriales (`territorial_fed_1@test.com`, `territorial_fed_2@test.com`) - Scope: Secciones asignadas
    - 40 Líderes (20 por coordinador territorial) con secciones locales (`lider_fed_1@test.com`, etc.)
    - 20,000 Simpatizantes (500 por cada uno de los 40 líderes).

2. **Tenant 2 (Presidencia Municipal - Tuxtla Gutiérrez)**
    - Administrador / Candidato: `candidato_mun@test.com` (Rol: candidato)
    - 1 Coordinador de Campaña (`coord_mun@test.com`)
    - 2 Coordinadores Territoriales (`territorial_mun_1@test.com`, `territorial_mun_2@test.com`)
    - 40 Líderes
    - 20,000 Simpatizantes.

## Base de Datos Afectada
- `tenants`: Inserción de 2 campañas.
- `users`: Inserción de 1 + 1 + 2 + 40 = 44 usuarios por campaña (88 usuarios totales con credenciales).
- `supporters`: 20,000 simpatizantes por campaña (40,000 en total).

## Herramientas
- Uso de `@faker-js/faker` o datos aleatorios (Math.random) para generar nombres, teléfonos y direcciones geolocalizadas cerca de Tuxtla.
- Contraseñas por defecto para los usuarios de prueba: `Test12345.` o algo similar.
- Script independiente en TSX transaccional si es posible o en cascada que el usuario podrá revisar antes de correr.

## Pruebas de Estrategia (Verification)
- Al correr el script se deberá ver la base de datos `tenants` con los 2 nuevos registros via `supabase.from('tenants').select('*')`.
- En Supabase > `users`, deben estar los 88 usuarios (candidatos, coords, líderes).
- Los líderes tendrán `zone_assignment` validado con un arreglo de secciones (ej. `['1686', '1687']`).
- Al loguearnos en la plataforma con el `candidato_mun@test.com` el radar mostrará 20,000 simpatizantes y todas las gráficas funcionarán.
