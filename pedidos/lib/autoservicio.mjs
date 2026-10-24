// Autoservicio del local: primeros pasos en dos niveles (con su avance) e importación
// de la carta desde una planilla (CSV o celdas copiadas de Excel). La meta es que el dueño deje
// el local andando sin ayuda (VIABILIDAD.md §4–5: soporte ≤ 0,5 h por local al mes).
const texto = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Pasos del asistente en dos niveles. "recibir": el mínimo para abrir la carta a los clientes (sin esto
// la carta de un local nuevo no sale de la pausa). "controlar": lo que hace falta para que los números
// del panel (costos, despacho, caja, equipo) sean reales y no supuestos.
// `omitible`: el dueño puede decir "no aplica". `ir`: pestaña (y sección) donde se completa.
export const NIVELES = { recibir: 'Para recibir pedidos', controlar: 'Para controlar tu local' };
export const ETAPAS = {
  preparar: { orden: 1, titulo: 'Prepara tu carta', detalle: 'Deja lista la base que verá tu cliente.' },
  configurar: { orden: 2, titulo: 'Configura la venta', detalle: 'Define cómo, cuándo y con qué condiciones venderás.' },
  probar: { orden: 3, titulo: 'Haz una prueba real', detalle: 'Comprueba el flujo completo con un pedido operativo.' },
  operar: { orden: 4, titulo: 'Abre y mejora', detalle: 'Afina el control del local mientras ya estás vendiendo.' },
};
export const PASOS = [
  { id: 'contacto', nivel: 'recibir', etapa: 'preparar', puntos: 10, titulo: 'Datos de contacto', detalle: 'WhatsApp o teléfono y la dirección del local.', ir: 'local#s-contacto' },
  { id: 'horario', nivel: 'recibir', etapa: 'configurar', puntos: 10, titulo: 'Horario de atención', detalle: 'Los días y horas en que se pueden pedir.', ir: 'local#s-horario' },
  { id: 'transferencias', nivel: 'recibir', etapa: 'configurar', puntos: 10, titulo: 'Datos para transferencias', detalle: 'El cliente los ve al pagar.', omitible: true, ir: 'local#s-pagos' },
  { id: 'producto', nivel: 'recibir', etapa: 'preparar', puntos: 20, titulo: 'Carta con precios', detalle: 'Al menos un producto a la venta y ninguno disponible "sin precio".', ir: 'carta' },
  { id: 'despacho', nivel: 'recibir', etapa: 'configurar', puntos: 10, titulo: 'Despacho', detalle: 'Revisa costos, zonas y horario, o desactívalo si solo hay retiro.', ir: 'despacho' },
  { id: 'legal', nivel: 'recibir', etapa: 'configurar', puntos: 10, titulo: 'Datos legales', detalle: 'Razón social, RUT, giro, domicilio y representante: arman tus Términos y tu Privacidad.', ir: 'local#s-legal' },
  { id: 'contrato', nivel: 'recibir', etapa: 'configurar', puntos: 10, titulo: 'Contrato de servicio', detalle: 'El dueño lo acepta en línea, con los datos legales del local.', ir: 'local#s-contrato' },
  { id: 'vehiculo', nivel: 'controlar', etapa: 'operar', puntos: 5, titulo: 'Vehículo y repartidor', detalle: 'Con qué y quién reparte: calcula si cada despacho sale a cuenta.', ir: 'despacho' },
  { id: 'costos', nivel: 'controlar', etapa: 'operar', puntos: 5, titulo: 'Costos de insumos', detalle: 'El costo de tus productos; sin él, el margen se estima.', ir: 'carta' },
  { id: 'equipo', nivel: 'controlar', etapa: 'operar', puntos: 5, titulo: 'Equipo con PIN', detalle: 'Cada persona entra con su PIN y queda registrado quién cobra.', ir: 'local#s-usuarios' },
  { id: 'caja', nivel: 'controlar', etapa: 'operar', puntos: 5, titulo: 'Primera caja', detalle: 'Abre la caja con el fondo inicial y ciérrala al final del día.', ir: 'cierre' },
  { id: 'logo', nivel: 'controlar', etapa: 'operar', puntos: 5, titulo: 'Logo', detalle: 'Aparece en la carta, el seguimiento y el cartel con QR.', omitible: true, ir: 'local#s-logo' },
];
export const MAX_FILAS = 500;
export const MAX_TEXTO = 200e3;

// ---------- planilla ----------
// Separa un CSV o lo pegado desde Excel (tabulaciones). Acepta comillas con "" adentro y saltos
// de línea dentro de una celda. El separador se deduce de la primera línea: tab, ";" (Excel en
// español) o ",".
export function leerPlanilla(txt) {
  const s = String(txt ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primera = s.split('\n').find((l) => l.trim()) || '';
  const cuenta = (c) => primera.split(c).length - 1;
  const sep = cuenta('\t') ? '\t' : cuenta(';') >= cuenta(',') && cuenta(';') ? ';' : ',';
  const filas = [];
  let fila = [], celda = '', comillas = false, linea = 1, inicio = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comillas) {
      if (c === '"' && s[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else { if (c === '\n') linea++; celda += c; }
    } else if (c === '"' && !celda.trim()) { comillas = true; celda = ''; }
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n') { fila.push(celda); filas.push({ linea: inicio, celdas: fila }); fila = []; celda = ''; linea++; inicio = linea; }
    else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push({ linea: inicio, celdas: fila }); }
  return filas.map((f) => ({ ...f, celdas: f.celdas.map((x) => x.trim()) })).filter((f) => f.celdas.some(Boolean));
}

// "$4.500", "4.500", "4500", "4500,00" → 4500. Vacío → null (sin precio). Inválido → NaN.
export function leerPrecio(v) {
  const t = String(v ?? '').replace(/[$\s]|clp/gi, '');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Math.round(Number(t.replace(/\./g, '').replace(',', '.')));
  if (/^\d+(,\d{1,2})?$/.test(t)) return Math.round(Number(t.replace(',', '.')));
  if (/^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, '')); // 4,500 al estilo inglés
  if (/^\d+\.\d{1,2}$/.test(t)) return Math.round(Number(t));
  return NaN;
}

const COLUMNAS = [
  ['categoria', /^(categoria|seccion|tipo|grupo)/],
  ['nombre', /^(producto|nombre|plato|item|articulo)/],
  ['precio', /^(precio|valor|monto)/],
  ['descripcion', /^(descripcion|detalle|ingredientes|desc)/],
];
// Filas de la planilla → [{linea, categoria, nombre, precio, descripcion}] o { error }. Si la primera
// fila trae títulos (Producto, Precio…) se usan; si no, el orden es categoría, producto, precio, descripción.
export function filasDeTexto(txt) {
  if (String(txt ?? '').length > MAX_TEXTO) return { error: 'La planilla es demasiado grande: divídela en partes de hasta 500 productos.' };
  const filas = leerPlanilla(txt);
  if (!filas.length) return { error: 'Pega la planilla o elige un archivo CSV.' };
  let mapa = { categoria: 0, nombre: 1, precio: 2, descripcion: 3 };
  const titulos = filas[0].celdas.map(norm);
  const conTitulos = titulos.some((t) => COLUMNAS[1][1].test(t)) && titulos.some((t) => COLUMNAS[2][1].test(t));
  if (conTitulos) {
    mapa = {};
    for (const [k, re] of COLUMNAS) { const i = titulos.findIndex((t) => re.test(t)); if (i >= 0) mapa[k] = i; }
    filas.shift();
  }
  if (filas.length > MAX_FILAS) return { error: `La planilla tiene ${filas.length} filas; el máximo es ${MAX_FILAS} por vez.` };
  const de = (f, k) => (mapa[k] === undefined ? '' : f.celdas[mapa[k]] ?? '');
  return { filas: filas.map((f) => ({ linea: f.linea, categoria: de(f, 'categoria'), nombre: de(f, 'nombre'), precio: de(f, 'precio'), descripcion: de(f, 'descripcion') })), con_titulos: conTitulos };
}

export function crearAutoservicio(db, { legalCompleto = () => false, contratoVigente = () => false } = {}) {
  // Estado del asistente por local: { hechos: ['horario'], omitidos: ['logo'], cerrado: true }.
  // Los locales que ya existían al crear la columna se armaron a mano: no ven el asistente.
  const lcols = new Set(db.prepare('PRAGMA table_info(locales)').all().map((c) => c.name));
  if (!lcols.has('inicio')) {
    db.exec('ALTER TABLE locales ADD COLUMN inicio TEXT');
    db.exec(`UPDATE locales SET inicio='{"cerrado":true}'`);
  }
  // Despacho revisado por el local (guardó la pestaña Despacho o lo desactivó): mientras no, la
  // configuración es la de ejemplo y no cuenta para publicar.
  if (!lcols.has('despacho_confirmado')) db.exec('ALTER TABLE locales ADD COLUMN despacho_confirmado INTEGER NOT NULL DEFAULT 0');
  // Carta publicada alguna vez: a esos locales no se les bloquea la pausa (solo ven el aviso).
  if (!lcols.has('publicado')) {
    db.exec('ALTER TABLE locales ADD COLUMN publicado INTEGER NOT NULL DEFAULT 0');
    // Los que ya recibían pedidos usan su horario de verdad: no se les pide "revisarlo" otra vez.
    for (const l of db.prepare('SELECT id, inicio FROM locales WHERE pausa=0').all()) {
      let e = {}; try { e = JSON.parse(l.inicio || '{}') || {}; } catch {}
      e.hechos = [...new Set([...(e.hechos || []), 'horario'])];
      db.prepare('UPDATE locales SET inicio=? WHERE id=?').run(JSON.stringify(e), l.id);
    }
  }
  db.exec('UPDATE locales SET publicado=1 WHERE pausa=0 AND publicado=0'); // si hoy recibe pedidos, ya está publicado
  const leer = (lid) => { try { return { hechos: [], omitidos: [], cerrado: false, ...JSON.parse(db.prepare('SELECT inicio FROM locales WHERE id=?').get(lid)?.inicio || '{}') }; } catch { return { hechos: [], omitidos: [], cerrado: false }; } };
  const guardar = (lid, e) => db.prepare('UPDATE locales SET inicio=? WHERE id=?').run(JSON.stringify(e), lid);
  const json = (v) => { try { return JSON.parse(v || '{}') || {}; } catch { return {}; } };

  function hechos(lid, e) {
    const l = db.prepare('SELECT whatsapp, telefono, direccion, logo, transferencia, despacho, despacho_confirmado, equipo FROM locales WHERE id=?').get(lid);
    const t = json(l.transferencia), d = json(l.despacho), eq = json(l.equipo);
    const hay = (sql) => !!db.prepare(sql).get(lid);
    const reps = (eq.trabajadores || []).some((x) => x.rol === 'repartidor' && x.activo !== false);
    const vehiculos = Array.isArray(d.vehiculos) ? d.vehiculos : [];
    return {
      contacto: !!((l.whatsapp || l.telefono) && l.direccion),
      horario: e.hechos.includes('horario'),
      transferencias: !!(t.numero && t.banco && t.titular),
      producto: hay('SELECT 1 FROM productos WHERE local_id=? AND archivado=0 AND activo=1 AND precio>0 AND precio_pendiente=0')
        && !hay('SELECT 1 FROM productos WHERE local_id=? AND archivado=0 AND activo=1 AND (precio_pendiente=1 OR precio<=0)'),
      despacho: !!l.despacho_confirmado,
      legal: !!legalCompleto(lid),
      contrato: !!contratoVigente(lid),
      // Sin despacho no hay vehículo que cargar: el paso no aplica.
      vehiculo: d.activo ? vehiculos.length > 0 && (reps || vehiculos.some((v) => v.repartidorId)) : 'no_aplica',
      costos: hay('SELECT 1 FROM productos WHERE local_id=? AND archivado=0 AND costo IS NOT NULL'),
      equipo: hay('SELECT 1 FROM usuarios WHERE local_id=? AND activo=1'),
      caja: hay('SELECT 1 FROM caja_movimientos WHERE local_id=?') || hay('SELECT 1 FROM caja_cierres WHERE local_id=?'),
      logo: !!l.logo,
    };
  }
  function estado(lid) {
    const e = leer(lid), h = hechos(lid, e);
    const l = db.prepare('SELECT pausa, publicado FROM locales WHERE id=?').get(lid);
    const pasos = PASOS.map((p) => ({ ...p, hecho: !!h[p.id], no_aplica: h[p.id] === 'no_aplica', omitido: !h[p.id] && !!p.omitible && e.omitidos.includes(p.id) }));
    const listo = (p) => p.hecho || p.omitido;
    const niveles = Object.fromEntries(Object.entries(NIVELES).map(([k, titulo]) => {
      const ps = pasos.filter((p) => p.nivel === k);
      return [k, { titulo, listos: ps.filter(listo).length, total: ps.length, completo: ps.every(listo), faltan: ps.filter((p) => !listo(p)).map((p) => p.id) }];
    }));
    const listos = pasos.filter(listo).length;
    // El hito exige una operación terminada: crear o preparar un pedido todavía no prueba cobro/entrega.
    const primeraOperacion = !!db.prepare("SELECT 1 FROM pedidos WHERE local_id=? AND estado='entregado' LIMIT 1").get(lid);
    const puntos = pasos.filter((p) => p.hecho && !p.no_aplica).reduce((n, p) => n + p.puntos, 0) + (primeraOperacion ? 20 : 0);
    const bloqueantes = pasos.filter((p) => p.nivel === 'recibir' && !listo(p));
    const mejoras = pasos.filter((p) => p.nivel === 'controlar' && !listo(p));
    const operacion = { id: 'primera_operacion', etapa: 'probar', titulo: 'Primer pedido operativo', detalle: 'Registra un pedido real desde la carta o Venta rápida y llévalo hasta la operación.', ir: 'venta', puntos: 20, hecho: primeraOperacion };
    const prioridad = (p) => (ETAPAS[p.etapa]?.orden || 99) * 100 + PASOS.findIndex((x) => x.id === p.id);
    const siguiente = bloqueantes.sort((a, b) => prioridad(a) - prioridad(b))[0] || (!primeraOperacion && niveles.recibir.completo ? operacion : mejoras[0]) || null;
    const etapas = Object.fromEntries(Object.entries(ETAPAS).map(([id, meta]) => {
      const ps = id === 'probar' ? [operacion] : pasos.filter((p) => p.etapa === id);
      const puntuables = ps.filter((p) => !p.no_aplica && !p.omitido);
      const hechos = puntuables.filter((p) => p.hecho).length;
      return [id, { id, ...meta, hechos, total: puntuables.length, completo: ps.every((p) => p.hecho || p.omitido), pasos: ps.map((p) => p.id) }];
    }));
    const puntosTotal = pasos.filter((p) => !p.no_aplica && !p.omitido).reduce((n, p) => n + p.puntos, 0) + operacion.puntos;
    return { pasos, niveles, etapas, puntos, puntos_total: puntosTotal, hito_operativo: operacion, siguiente,
      bloqueantes: bloqueantes.map((p) => p.id), mejoras: mejoras.map((p) => p.id), listos, total: pasos.length,
      completo: listos === pasos.length, mision_completa: listos === pasos.length && primeraOperacion, cerrado: !!e.cerrado,
      listo_publicar: niveles.recibir.completo, publicado: !!l.publicado, pausa: !!l.pausa };
  }
  // Lo que falta para abrir la carta (nivel "Para recibir pedidos"), con dónde se completa.
  const faltanRecibir = (lid) => estado(lid).pasos.filter((p) => p.nivel === 'recibir' && !p.hecho && !p.omitido).map((p) => ({ id: p.id, titulo: p.titulo, detalle: p.detalle, ir: p.ir }));
  // Avance corto para la consola de administración.
  const corto = (lid) => {
    const e = estado(lid), r = e.niveles.recibir;
    return { listos: e.listos, total: e.total, cerrado: e.cerrado, publicado: e.publicado, recibir: { listos: r.listos, total: r.total, faltan: r.faltan } };
  };

  function marcar(lid, id) {
    const e = leer(lid);
    if (!e.hechos.includes(id)) { e.hechos.push(id); guardar(lid, e); }
  }
  // PATCH del asistente: omitir o retomar un paso, cerrar o volver a abrir el asistente.
  function actualizar(lid, b) {
    const e = leer(lid);
    for (const [k, on] of [['omitir', true], ['retomar', false]]) {
      if (b[k] === undefined) continue;
      const p = PASOS.find((x) => x.id === b[k]);
      if (!p?.omitible) return { error: 'Ese paso no se puede omitir.' };
      e.omitidos = e.omitidos.filter((x) => x !== p.id).concat(on ? [p.id] : []);
    }
    if (b.horario_ok) e.hechos = [...new Set([...e.hechos, 'horario'])];
    if (b.cerrado !== undefined) e.cerrado = !!b.cerrado;
    guardar(lid, e);
    return estado(lid);
  }

  // ---------- importar la carta ----------
  // Revisa cada fila y dice qué se hará con ella. Nada se guarda aquí.
  function analizar(lid, entrada, modo) {
    const r = Array.isArray(entrada.filas)
      ? { filas: entrada.filas.slice(0, MAX_FILAS + 1).map((f, i) => ({ linea: i + 1, categoria: f?.categoria, nombre: f?.nombre, precio: f?.precio, descripcion: f?.descripcion })) }
      : filasDeTexto(entrada.texto);
    if (r.error) return { error: r.error };
    if (r.filas.length > MAX_FILAS) return { error: `El máximo es ${MAX_FILAS} productos por vez.` };
    const cats = db.prepare('SELECT id, nombre FROM categorias WHERE local_id=?').all(lid);
    const catDe = new Map(cats.map((c) => [norm(c.nombre), c]));
    const existentes = db.prepare('SELECT id, categoria_id, nombre, precio, descripcion FROM productos WHERE local_id=? AND archivado=0').all(lid);
    const prodDe = new Map(existentes.map((p) => [`${p.categoria_id}|${norm(p.nombre)}`, p]));
    const vistos = new Set(), nuevasCats = new Map(), usados = new Set();
    let anterior = '';
    const filas = r.filas.map((f) => {
      // Celda de categoría vacía = la misma de la fila anterior (planillas con celdas combinadas).
      const categoria = texto(f.categoria, 41) || anterior;
      anterior = categoria;
      const nombre = texto(f.nombre, 81), descripcion = texto(f.descripcion, 201), precio = typeof f.precio === 'number' ? Math.round(f.precio) : leerPrecio(f.precio);
      const o = { linea: f.linea, categoria: categoria.slice(0, 40), nombre: nombre.slice(0, 80), precio, descripcion: descripcion.slice(0, 200) || null, avisos: [] };
      if (!nombre) o.error = 'Falta el nombre del producto.';
      else if (!categoria) o.error = 'Falta la categoría.';
      else if (nombre.length > 80) o.error = 'El nombre es muy largo (máximo 80 letras).';
      else if (categoria.length > 40) o.error = 'La categoría es muy larga (máximo 40 letras).';
      else if (Number.isNaN(precio)) o.error = `Precio "${texto(f.precio, 20)}" no se entiende. Escríbelo como 4500 o $4.500.`;
      else if (precio != null && !(precio >= 0 && precio <= 1e6)) o.error = 'El precio debe estar entre $0 y $1.000.000.';
      if (o.error) return o;
      if (descripcion.length > 200) o.avisos.push('La descripción se corta en 200 letras.');
      const clave = `${norm(o.categoria)}|${norm(o.nombre)}`;
      if (vistos.has(clave)) { o.error = 'Está repetido en la planilla.'; return o; }
      vistos.add(clave);
      const cat = catDe.get(norm(o.categoria));
      if (!cat) nuevasCats.set(norm(o.categoria), o.categoria);
      const actual = cat && prodDe.get(`${cat.id}|${norm(o.nombre)}`);
      o.accion = actual ? 'actualiza' : 'nuevo';
      if (actual) {
        usados.add(actual.id);
        o.id = actual.id; o.precio_anterior = actual.precio;
        if (o.precio == null) o.avisos.push('Sin precio en la planilla: se mantiene el actual.');
      } else if (!o.precio) o.avisos.push('Sin precio: queda "sin precio" y no se vende hasta que se lo pongas.');
      return o;
    });
    const errores = filas.filter((f) => f.error).length;
    const archivados = modo === 'reemplazar' ? existentes.filter((p) => !usados.has(p.id)).map((p) => p.nombre) : [];
    return { modo, filas, errores, nuevos: filas.filter((f) => f.accion === 'nuevo').length, actualizados: filas.filter((f) => f.accion === 'actualiza').length,
      categorias_nuevas: [...nuevasCats.values()], archivados, con_titulos: !!r.con_titulos };
  }

  // Guarda lo analizado. Los productos que salen de la carta (reemplazar) se archivan: los pedidos
  // antiguos los siguen nombrando. Los que coinciden por categoría y nombre conservan foto y costo.
  function importar(lid, entrada, modo) {
    const a = analizar(lid, entrada, modo);
    if (a.error || a.errores) return a;
    if (!a.filas.length) return { error: 'La planilla no trae productos.' };
    db.exec('BEGIN');
    try {
      const catId = new Map(db.prepare('SELECT id, nombre FROM categorias WHERE local_id=?').all(lid).map((c) => [norm(c.nombre), c.id]));
      let ordenCat = db.prepare('SELECT COALESCE(MAX(orden),-1)+1 n FROM categorias WHERE local_id=?').get(lid).n;
      for (const nombre of a.categorias_nuevas)
        catId.set(norm(nombre), Number(db.prepare('INSERT INTO categorias (local_id,nombre,orden) VALUES (?,?,?)').run(lid, nombre, ordenCat++).lastInsertRowid));
      if (modo === 'reemplazar') {
        const quedan = a.filas.filter((f) => f.id).map((f) => f.id);
        db.prepare(`UPDATE productos SET archivado=1 WHERE local_id=? AND archivado=0${quedan.length ? ` AND id NOT IN (${quedan.map(() => '?').join(',')})` : ''}`).run(lid, ...quedan);
      }
      const orden = new Map();
      const sigOrden = (cid) => { const n = orden.has(cid) ? orden.get(cid) : db.prepare('SELECT COALESCE(MAX(orden),-1)+1 n FROM productos WHERE categoria_id=?').get(cid).n; orden.set(cid, n + 1); return n; };
      for (const f of a.filas) {
        const cid = catId.get(norm(f.categoria));
        if (f.id) {
          const p = db.prepare('SELECT precio, descripcion, precio_pendiente FROM productos WHERE id=?').get(f.id);
          const precio = f.precio ?? p.precio;
          db.prepare('UPDATE productos SET precio=?, descripcion=?, precio_pendiente=? WHERE id=?').run(precio, f.descripcion ?? p.descripcion, precio > 0 ? 0 : p.precio_pendiente, f.id);
          if (precio !== p.precio) db.prepare('INSERT INTO historial_precio (local_id,producto_id,anterior,nuevo) VALUES (?,?,?,?)').run(lid, f.id, p.precio, precio);
        } else {
          db.prepare('INSERT INTO productos (local_id,categoria_id,nombre,descripcion,precio,precio_pendiente,orden) VALUES (?,?,?,?,?,?,?)')
            .run(lid, cid, f.nombre, f.descripcion, f.precio || 0, f.precio ? 0 : 1, sigOrden(cid));
        }
      }
      // Al reemplazar, las categorías que quedaron sin ningún producto (ni archivado) sobran.
      if (modo === 'reemplazar') db.prepare('DELETE FROM categorias WHERE local_id=? AND NOT EXISTS (SELECT 1 FROM productos WHERE categoria_id=categorias.id)').run(lid);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ok: true, nuevos: a.nuevos, actualizados: a.actualizados, categorias_nuevas: a.categorias_nuevas, archivados: a.archivados.length };
  }

  return { estado, corto, marcar, actualizar, analizar, importar, faltanRecibir };
}
