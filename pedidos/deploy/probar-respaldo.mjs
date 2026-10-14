// Prueba que un respaldo se puede restaurar: no basta con hacerlo, hay que poder volver a él.
// Toma un .tgz (respaldo.ps1 / exportar.sh) o un .db (respaldo diario del servidor), revisa la
// integridad de la base, cuenta lo importante y levanta el servidor con esa copia en una carpeta
// temporal para confirmar que arranca y entrega la carta. No toca los datos reales.
//
// Uso:  node --disable-warning=ExperimentalWarning deploy/probar-respaldo.mjs <archivo.tgz|archivo.db>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const archivo = process.argv[2];
// En Windows se usa el tar del sistema: el de Git Bash confunde "C:" con un servidor remoto.
const TAR_WIN = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
const TAR = process.platform === 'win32' && fs.existsSync(TAR_WIN) ? TAR_WIN : 'tar';
const fallar = (m) => { console.error(`✖ ${m}`); process.exitCode = 1; };

async function probar() {
  if (!archivo || !fs.existsSync(archivo)) return fallar('Indica un respaldo existente (.tgz o .db).');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-restaurar-'));
  const data = path.join(tmp, 'data');
  fs.mkdirSync(data);
  try {
    // 1. Sacar la base (y las fotos, si vienen).
    if (/\.t?gz$/.test(archivo)) {
      execFileSync(TAR, ['-xzf', path.resolve(archivo), '-C', data]);
      const db = path.join(data, 'backups', 'externo.db');
      if (!fs.existsSync(db)) return fallar('El .tgz no trae backups/externo.db.');
      fs.renameSync(db, path.join(data, 'pedidos.db'));
    } else fs.copyFileSync(archivo, path.join(data, 'pedidos.db'));

    // 2. Integridad y contenido.
    const db = new DatabaseSync(path.join(data, 'pedidos.db'));
    let integ;
    try { integ = Object.values(db.prepare('PRAGMA integrity_check').get())[0]; } catch (e) { integ = e.message; }
    if (integ !== 'ok') { db.close(); return fallar(`La base está dañada: ${integ}`); }
    const n = (t) => { try { return db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { return '—'; } };
    const locales = db.prepare('SELECT slug FROM locales').all().map((l) => l.slug);
    const ultimo = db.prepare('SELECT MAX(dia) d FROM pedidos').get().d;
    const resumen = `pedidos: ${n('pedidos')} (último día: ${ultimo || '—'}) · productos: ${n('productos')} · gastos y movimientos: ${n('caja_movimientos')}`;
    db.close();
    if (!locales.length) return fallar('La base no tiene locales.');
    console.log(`✓ Base íntegra · locales: ${locales.join(', ')} · ${resumen}`);
    const fotos = fs.existsSync(path.join(data, 'img')) ? fs.readdirSync(path.join(data, 'img')).filter((f) => f.endsWith('.webp')).length : 0;
    console.log(`✓ Fotos en el respaldo: ${fotos}${/\.db$/.test(archivo) ? ' (un .db no trae fotos; el .tgz sí)' : ''}`);

    // 3. Arrancar el servidor con la copia y pedir la carta de cada local.
    const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: data, PANEL_PASSWORD: '' },
    });
    try {
      const base = await new Promise((ok, mal) => {
        const t = setTimeout(() => mal(new Error('el servidor no arrancó en 15 s')), 15e3);
        srv.stdout.on('data', (d) => { const m = /http:\/\/([\d.]+:\d+)/.exec(String(d)); if (m) { clearTimeout(t); ok(`http://${m[1]}`); } });
        srv.on('exit', (c) => mal(new Error(`el servidor terminó con código ${c}`)));
      });
      for (const slug of locales) {
        const r = await fetch(`${base}/api/locales/${slug}`);
        const m = await r.json();
        if (r.status !== 200 || !m.categorias?.length) return fallar(`La carta de ${slug} no carga (${r.status}).`);
        console.log(`✓ El servidor arranca con el respaldo y entrega la carta de ${slug} (${m.categorias.length} categorías)`);
      }
    } finally { if (srv.exitCode === null) { const fin = new Promise((ok) => srv.once('exit', ok)); srv.kill(); await fin; } }
    console.log('✓ Respaldo restaurable.');
  } catch (e) { fallar(e.message); } finally {
    // Windows puede tardar en soltar el archivo de la base: se reintenta un momento.
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { console.warn(`(no se pudo borrar la carpeta temporal ${tmp}; se puede borrar a mano)`); }
  }
}
await probar();
