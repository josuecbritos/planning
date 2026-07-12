# Guía de despliegue — de la rama a la URL productiva

Pasos para dejar la herramienta corriendo con Supabase real y una URL
accesible para el equipo y los clientes (sección 9 del Documento Funcional).
Tiempo estimado: 30–45 minutos. Costo: $0 (capas gratuitas).

---

## Paso 0 — Integrar la rama

Todo el trabajo está en la rama `claude/markdown-idea-dev-3noisv`. Intégrala a
`main` (por PR o merge directo). Los despliegues automáticos se cuelgan de `main`.

---

## Paso 1 — Crear el proyecto Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Elige nombre (ej. `planificador`), contraseña de base de datos (guárdala) y
   región (para Chile: `South America (São Paulo)` es la más cercana).
3. Espera ~2 minutos a que el proyecto quede listo.

## Paso 2 — Aplicar el esquema

En el panel de Supabase → **SQL Editor** → New query. Pega y ejecuta **en este
orden** el contenido de:

1. `supabase/migrations/20260707000001_init.sql` — tablas, trigger de historial, RPC
2. `supabase/migrations/20260707000002_fase2_auth.sql` — auth, límite 2 admins, RLS
3. `supabase/migrations/20260707000003_fase3_archivo.sql` — archivo de canceladas
4. `supabase/migrations/20260707000004_fix_rls_insert_proyecto.sql` — fix: creación
   de proyectos violaba RLS (políticas de SELECT reescritas con expresión directa)

*(Alternativa con CLI: `supabase link --project-ref TU_REF && supabase db push`.)*

## Paso 3 — Crear los usuarios iniciales

⚠️ **Antes de ejecutar el seed**, edita en `supabase/seed.sql` los emails de los
2 admins (hoy son `dv@consultora.cl` / `jb@consultora.cl`) y del cliente demo,
poniendo los **emails reales** que usarán para entrar. Luego ejecuta el seed en
el SQL Editor (o `supabase db reset` con CLI, que aplica migraciones + seed).

> Si prefieres partir sin datos de ejemplo, ejecuta solo los `insert into usuario`
> y `acceso_cliente_proyecto` del seed y omite proyecto/frentes/tareas.
> Si ya ejecutaste el seed con los emails placeholder, corrígelos con:
> `update usuario set email = 'tu@email.real' where email = 'jb@consultora.cl';`

Después, en el panel → **Authentication → Users → Add user → Create new user**:

- Crea una cuenta por cada usuario, con el **mismo email** que quedó en la tabla
  `usuario` y una contraseña.
- Marca **Auto Confirm User** para no depender del correo de confirmación.

Al primer inicio de sesión, el trigger `vincular_usuario_auth` enlaza
automáticamente la cuenta de Auth con la fila de `usuario` (por email).

## Paso 4 — Cerrar el registro público (importante)

Por defecto Supabase permite que cualquiera se registre por API. La RLS impide
que un desconocido vea datos (sin fila en `usuario` no ve nada), pero igual
conviene cerrarlo: **Authentication → Sign In / Providers → Email** →
desactiva **"Allow new users to sign up"**. Los usuarios los creas siempre tú
desde el panel (paso 3) + el Módulo de Usuarios de la app.

## Paso 5 — Probar en local contra Supabase

```bash
cp .env.example .env
```

Completa `.env` con los valores de **Settings → API** del proyecto:

```
VITE_SUPABASE_URL=https://TU-REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # la "anon public" key
```

> La anon key es pública por diseño; la seguridad la pone la RLS.
> La **service_role** key NUNCA va en el frontend ni en el repo.

```bash
npm install
npm run dev
```

Verifica: el chip del encabezado debe decir **Supabase** (no "Local"), el login
pide contraseña, y al entrar como admin ves el proyecto del seed.

## Paso 6 — Desplegar en Vercel (recomendado)

1. [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo
   `josuecbritos/planning` desde GitHub.
2. Vercel detecta Vite solo. Verifica: Build Command `npm run build`,
   Output Directory `dist`.
3. En **Environment Variables** agrega las mismas dos variables del `.env`:
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. Obtienes una URL `https://planificador-xxx.vercel.app`.
5. (Opcional) Settings → Domains para un dominio propio.

Desde aquí, cada push a `main` redepliega automáticamente.

### Alternativa: Netlify

Add new site → Import from Git → mismo build (`npm run build`, publish `dist`)
→ mismas variables de entorno → Deploy. Para que las rutas funcionen igual no
se necesita nada extra (la app es una sola página, sin rutas de servidor).

## Paso 7 — Checklist final

- [ ] Entrar con los 2 admins desde la URL productiva.
- [ ] Crear un usuario Cliente desde el Módulo de Usuarios y asignarle un proyecto.
- [ ] Crear la cuenta Auth de ese cliente (panel, paso 3) y probar que al entrar
      **solo ve su proyecto y en solo lectura**.
- [ ] Cambiar una fecha objetivo y verificar que el historial aparece en el
      tooltip / panel de detalle (el trigger funciona).
- [ ] Confirmar que el registro público está desactivado (paso 4).

## Mantenimiento

- **Nuevos usuarios**: Módulo de Usuarios (app) + Authentication → Add user (panel),
  siempre con el mismo email.
- **Cambios de esquema futuros**: nuevos archivos en `supabase/migrations/`,
  aplicados por SQL Editor o `supabase db push`.
- **Respaldo**: Supabase free incluye respaldos diarios (7 días). Para algo más,
  Settings → Database → exportar dump.
