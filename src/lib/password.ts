// #204 — Política de contraseña, en UN solo lugar.
//
// La usan los dos flujos que definen una contraseña (activar una invitación y
// restablecerla) y el cambio desde Configuración. Antes vivía copiada dentro
// de la pantalla de invitación: cambiar la regla obligaba a acordarse de todos
// los sitios, que es justo donde se cuelan las diferencias silenciosas.
//
// El espejo server-side vive en las Edge Functions (invariante 7 de
// SEGURIDAD.md). Esto es la validación de conveniencia del cliente: evita que
// alguien mande el formulario para recibir un error del servidor.

export const REGLA_PASSWORD =
  'La contraseña debe tener al menos 10 caracteres e incluir letras y números.'

/** Mínimo 10 caracteres, con letras y números. */
export function passwordFuerte(p: string): boolean {
  return p.length >= 10 && /[a-zA-Z]/.test(p) && /[0-9]/.test(p)
}
