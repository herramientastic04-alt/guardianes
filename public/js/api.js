// Cliente de datos. Usa las funciones de Netlify y, si no existen (vista previa sin servidor), un modo de demostración local.
const LS_TOKEN = 'gs_token';
const LS_ROL = 'gs_rol';
const LS_DEMO = 'gs_demo_datos';
export let MODO_DEMO = false;

const DOC_USUARIO = 'docenteinvestigador';
const DOC_CLAVE = 'CasasBajas1927';

function ls(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; }
}
export const sesionGuardada = () => ({ token: ls(LS_TOKEN), rol: ls(LS_ROL) });
export function guardarSesion(token, rol) { ls(LS_TOKEN, token); ls(LS_ROL, rol); }
export function cerrarSesion() { ls(LS_TOKEN, null); ls(LS_ROL, null); }

export async function detectarServidor() {
  try {
    const r = await fetch('/api/salud', { cache: 'no-store' });
    const d = await r.json();
    MODO_DEMO = !(r.ok && d.ok);
  } catch { MODO_DEMO = true; }
  return !MODO_DEMO;
}

async function llamar(ruta, metodo = 'GET', cuerpo) {
  if (MODO_DEMO) return demo(ruta, metodo, cuerpo);
  const { token } = sesionGuardada();
  const r = await fetch('/api/' + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let d = {};
  try { d = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(d.error || 'No fue posible conectar con el servidor.'); e.status = r.status; throw e; }
  return d;
}

export const api = {
  config: () => llamar('config'),
  registro: (datos) => llamar('registro', 'POST', datos),
  ingreso: (usuario, clave) => llamar('ingreso', 'POST', { usuario, clave }),
  docenteIngreso: (usuario, clave) => llamar('docente/ingreso', 'POST', { usuario, clave }),
  yo: () => llamar('yo'),
  avatar: (avatar) => llamar('avatar', 'PUT', { avatar }),
  progreso: (datos) => llamar('progreso', 'POST', datos),
  estudiantes: () => llamar('docente/estudiantes'),
  borrar: (u) => llamar('docente/estudiantes/' + u, 'DELETE'),
  nuevaClave: (u, clave) => llamar(`docente/estudiantes/${u}/clave`, 'PUT', { clave }),
  guardarVideos: (videos) => llamar('docente/config', 'PUT', { videos }),
};

// ------------------------------------------------------------------ modo demostración (localStorage)
function db() { try { return JSON.parse(ls(LS_DEMO) || '{}'); } catch { return {}; } }
function guardarDb(d) { ls(LS_DEMO, JSON.stringify(d)); }
const norm = (u) => String(u || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]/g, '').slice(0, 24);
const publico = (e) => { const { clave, ...resto } = e; return resto; };
function fallo(m, s = 400) { const e = new Error(m); e.status = s; throw e; }

async function demo(ruta, metodo, b = {}) {
  const d = db(); d.est = d.est || {}; d.videos = d.videos || {};
  const { token } = sesionGuardada();
  const [rol, quien] = String(token || '').split(':');
  if (ruta === 'config') return d.videos;
  if (ruta === 'registro') {
    const u = norm(b.usuario);
    if (!b.nombre || b.nombre.length < 3) fallo('Escribe tu nombre completo.');
    if (u.length < 3) fallo('El usuario debe tener al menos 3 letras o números.');
    if (!/^\d{4}$/.test(String(b.clave))) fallo('La clave debe tener 4 números.');
    if (d.est[u]) fallo('Ese usuario ya existe. Prueba con otro.', 409);
    const ahora = new Date().toISOString();
    d.est[u] = { usuario: u, nombre: b.nombre.trim(), edad: +b.edad, grado: b.grado || '7°', avatar: b.avatar, clave: String(b.clave), creado: ahora, actualizado: ahora, progreso: {} };
    guardarDb(d);
    return { token: 'est:' + u, perfil: publico(d.est[u]) };
  }
  if (ruta === 'ingreso') {
    const e = d.est[norm(b.usuario)];
    if (!e || e.clave !== String(b.clave)) fallo('Usuario o clave incorrectos.', 401);
    return { token: 'est:' + e.usuario, perfil: publico(e) };
  }
  if (ruta === 'docente/ingreso') {
    if (String(b.usuario).trim().toLowerCase() !== DOC_USUARIO || b.clave !== DOC_CLAVE) fallo('Datos de docente incorrectos.', 401);
    return { token: 'doc:' + DOC_USUARIO };
  }
  if (rol === 'est') {
    const e = d.est[quien]; if (!e) fallo('Debes iniciar sesión.', 401);
    if (ruta === 'yo') return { perfil: publico(e) };
    if (ruta === 'avatar') { e.avatar = b.avatar; guardarDb(d); return { perfil: publico(e) }; }
    if (ruta === 'progreso') {
      const p = (e.progreso[b.sesion] = e.progreso[b.sesion] || { momentos: {}, actividades: {}, puntos: 0 });
      if (b.momento) p.momentos[b.momento] = new Date().toISOString();
      if (b.actividad) p.actividades[b.actividad.id] = { ...b.actividad, fecha: new Date().toISOString() };
      if (b.puntosMomento) { p.puntosMomento = { ...(p.puntosMomento || {}), ...b.puntosMomento }; p.puntos = Object.values(p.puntosMomento).reduce((x, y) => x + y, 0); }
      if (b.completada) { p.completada = p.completada || new Date().toISOString(); p.medalla = b.medalla; p.aciertos = b.aciertos; p.total = b.total; }
      e.actualizado = new Date().toISOString(); guardarDb(d); return { perfil: publico(e) };
    }
  }
  if (rol === 'doc') {
    if (ruta === 'docente/estudiantes') return { estudiantes: Object.values(d.est).map(publico).sort((a, b2) => a.nombre.localeCompare(b2.nombre, 'es')) };
    const m = ruta.match(/^docente\/estudiantes\/([a-z0-9.]+)(\/clave)?$/);
    if (m && metodo === 'DELETE') { delete d.est[m[1]]; guardarDb(d); return { ok: true }; }
    if (m && m[2]) { if (!/^\d{4}$/.test(String(b.clave))) fallo('La nueva clave debe tener 4 números.'); d.est[m[1]].clave = String(b.clave); guardarDb(d); return { ok: true }; }
    if (ruta === 'docente/config') { d.videos = b.videos || {}; guardarDb(d); return d.videos; }
  }
  fallo('Debes iniciar sesión.', 401);
}
