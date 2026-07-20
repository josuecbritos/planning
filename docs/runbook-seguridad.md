# Runbook — Correcciones de seguridad (post-auditoría)

Aplicar **en este orden**, antes de salir en vivo. Toca base de datos, Edge
Functions y headers de despliegue. Está pensado para hacerse sin usuarios
reales todavía.

## 0. Respaldo previo (obligatorio)

Antes de tocar la base, dejar un respaldo reversible:

- Export manual desde Supabase → Database (o `pg_dump`), como en la tanda de
  roles. El plan gratuito no trae backups automáticos.
- Las migraciones 14 y 15 son aditivas (redefinen funciones/políticas y ajustan
  grants); para revertir, restaurar el dump o reaplicar las definiciones
  previas de las migraciones 12/13.

## 1. Migraciones de base

1. **Migración 14** (`20260707000014_seguridad_auth_y_historial.sql`):
   - Punto 1 — el trigger `vincular_usuario_auth` ahora exige una invitación
     **usada** para enlazar `auth.users` ↔ `usuario` (defensa de C1).
   - Punto 2 — `replanificar_tarea` / `desplanificar_tarea` derivan el autor del
     historial de `usuario_actual_id()` (ignoran `p_actor` del cliente).
   - Punto 5 — `search_path` fijo en las 6 funciones señaladas.
2. **Migración 15** (`20260707000015_seguridad_exposicion_y_execute.sql`):
   - Punto 3 — `acceso_select` acotada (cada miembro solo ve su acceso; admin y
     dueño ven todos) + vista `usuario_visible` con `email`/`permisos_proyecto`
     enmascarados y **revocación del SELECT directo** sobre `usuario`.
   - Punto 6 — `revoke execute` de las funciones de trigger (a anon y
     authenticated) y de los predicados/RPC (solo a anon), sin romper la RLS.
   - Punto 10 — decisión documentada (reordenar estructura sigue permitido a
     miembros; el renombre sigue restringido a admin/dueño).

Aplicar con `supabase db push` (o el SQL editor), en orden.

## 2. Redeploy de las Edge Functions

El frontend nuevo lee la vista `usuario_visible`; y las funciones cambiaron:

```
supabase functions deploy aceptar-invitacion
supabase functions deploy invitar-usuario
```

- `aceptar-invitacion`: marca la invitación como **usada antes** de crear la
  cuenta (defensa C1), sube la política de contraseña a **≥10 con letras y
  números** (punto 4), acota CORS a `SITE_URL` (punto 8) y agrega rate limiting
  best-effort (punto 9).
- `invitar-usuario`: acota CORS a `SITE_URL` (punto 8).
- Requiere que el secreto **`SITE_URL`** esté configurado en las Edge Functions
  (ya se usa para el enlace de invitación).

## 3. Despliegue del frontend + headers (Vercel)

- El deploy toma `vercel.json` (nuevo): CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, HSTS y `Permissions-Policy`
  (punto 7). Verificar tras el deploy que la app carga y que la CSP no bloquea
  Supabase (`connect-src … *.supabase.co`) ni las fuentes.

## 4. Ajustes del dashboard (los hace el usuario)

- **Activar Leaked Password Protection** (Authentication → Policies) — complementa
  el punto 4.
- Registro público de Auth: ya verificado **OFF**.

## 5. Cierre — compuerta de RLS (criterio de aceptación)

Como **último paso**, correr la compuerta y no dar por terminado hasta que pase:

- Workflow de GitHub Actions **"Validar RLS (compuerta)"** (o `node
  scripts/validar-rls.mjs` con las credenciales). La compuerta ya lee la vista
  `usuario_visible` en `perfilDe`. Debe pasar **31/31**.
- Verificación manual recomendada de §3 (opcional): autenticado como un
  **cliente**, consultar por API `usuario_visible` y `acceso_proyecto` y
  confirmar que **no** aparecen el correo ni los permisos de otros miembros.

Si algún cambio hace fallar la compuerta, corregirlo antes de cerrar.
