# Monitoreo: enterarse antes que el local

El servidor está en casa (lenovo-edge). Si se corta la luz o internet, o si el túnel de Cloudflare se cae,
el local deja de recibir pedidos y nadie avisa. Por eso un servicio **externo** revisa la página cada
5 minutos y avisa al celular.

## Qué revisar

| URL | Qué confirma | Si falla |
|---|---|---|
| `https://pedidos.8vobit.xyz/salud/completo` | Que el servidor responde a través del túnel, que la base funciona, que hay un respaldo de las últimas 26 h y que quedan más de 500 MB en disco | Responde `503` con `falla: base`, `falla: respaldo` o `falla: disco` |
| `https://pedidos.8vobit.xyz/gassuso` | Que la carta carga (opcional, como segundo monitor) | |

`/salud` (sin `/completo`) es el chequeo interno de Docker: solo dice si el proceso está vivo.

## Configurar UptimeRobot (gratis, una vez, ~5 minutos)

Esto lo hace el dueño de la cuenta; Claude no crea cuentas.

1. Crear una cuenta en uptimerobot.com (plan gratis: 50 monitores, revisión cada 5 minutos).
2. **Add New Monitor** → tipo **Keyword**.
   - URL: `https://pedidos.8vobit.xyz/salud/completo`
   - Keyword: `ok`, con alerta cuando **no existe** ("Alert when keyword not exists").
   - Intervalo: 5 minutos.
3. **Alert contacts**: correo y la app de UptimeRobot en el celular (notificación push). Opcional: Telegram.
4. Repetir con un monitor tipo **HTTP(s)** para `https://pedidos.8vobit.xyz/gassuso`.
5. Opcional: una **página de estado** pública para mostrarle al local que el servicio se vigila.

Alternativa sin cuenta nueva: Cloudflare Health Checks (en el plan Pro de la zona) o Healthchecks.io.

## Qué hacer cuando avisa

| Aviso | Revisar |
|---|---|
| No responde | `ssh gabriel@lenovo-edge` → `sudo docker ps` (¿está `pedidos`?) y `sudo docker logs --tail 50 pedidos`. Si no hay SSH: luz o internet de la casa. Revisar `cloudflared` con `systemctl status cloudflared` |
| `falla: respaldo` | `sudo docker exec pedidos ls -la /data/backups`. El servidor respalda cada hora si no hay respaldo del día; un error queda en los logs como "respaldo falló" |
| `falla: disco` | `df -h`, y si hace falta limpiar imágenes viejas de Docker: `sudo docker image prune` |
| `falla: base` | Logs del contenedor; si la base se dañó, restaurar el último respaldo (`respaldo.ps1 -Restaurar`) |

## Respaldos: probar que se pueden restaurar

`respaldo.ps1` descarga la copia y **la prueba**: la restaura en una carpeta temporal, revisa la integridad
de la base y levanta el servidor con ella para confirmar que la carta carga. Para probar un archivo a mano:

```bash
node --disable-warning=ExperimentalWarning pedidos/deploy/probar-respaldo.mjs D:\Respaldos\pedidos\pedidos-FECHA.tgz
```

Las pruebas automáticas (`npm test`) también restauran el respaldo diario en cada corrida.
