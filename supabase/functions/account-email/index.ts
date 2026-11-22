// Desactivada: por ahora el acceso es solo con celular y código por SMS.
Deno.serve(() => new Response('gone', { status: 410 }));
