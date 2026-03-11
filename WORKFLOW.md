# Flujo de trabajo

## Estructura

- `index.html`: archivo publicado por GitHub Pages.
- `environments/staging`: entorno de pruebas. Parte desde el HTML original de `main`.
- `environments/production`: espejo local de lo que se publica.
- `backups/original-main`: copia congelada del `index.html` original del primer commit de `main`.
- `backups/snapshots`: respaldos con fecha antes de restaurar o promover cambios.

## Comandos

```bash
./scripts/preview_env.sh staging 8000
./scripts/preview_env.sh production 8001
./scripts/create_backup.sh "nota-opcional"
./scripts/restore_original_to_staging.sh
./scripts/promote_staging_to_production.sh
```

## Flujo recomendado

1. Edita `environments/staging/index.html`.
2. Si necesitas volver a la base original, ejecuta `./scripts/restore_original_to_staging.sh`.
3. Antes de pasar cambios, el script de promoción crea un backup automático.
4. Ejecuta `./scripts/promote_staging_to_production.sh`.
5. Revisa la raíz (`index.html`) y luego haz `git add`, `git commit` y `git push`.

## Limpieza

El repo ignora `wget-log*`, `__pycache__/`, `*.pyc` y el contenido generado dentro de `backups/snapshots/`.
