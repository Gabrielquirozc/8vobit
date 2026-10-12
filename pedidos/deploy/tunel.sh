#!/usr/bin/env bash
# Agrega pedidos.8vobit.xyz al túnel. Idempotente; respalda la config antes y
# valida con cloudflared antes de reiniciar. Correr solo una vez, a mano.
set -euo pipefail
CFG=/etc/cloudflared/config.yml
HOST=pedidos.8vobit.xyz
if grep -q "hostname: $HOST" "$CFG"; then echo "La regla de $HOST ya existe. Nada que hacer."; exit 0; fi
cp -a "$CFG" "$CFG.bak-$(date +%Y%m%d-%H%M%S)"
NUEVO=$(mktemp)
# Insertar antes de la regla final obligatoria (- service: http_status:404).
awk -v host="$HOST" '
  /^  - service: http_status:404/ && !done {
    print "  # Pedidos propios para locales (ver infra/docker-compose.pedidos.yml)."
    print "  - hostname: " host
    print "    service: http://127.0.0.1:8100"
    done=1
  }
  { print }
  END { if (!done) exit 3 }' "$CFG" > "$NUEVO" || { echo "No encontré la regla final 404; no se cambia nada."; rm -f "$NUEVO"; exit 1; }
# Validar ANTES de reemplazar: si falla, la config en uso queda intacta.
cloudflared tunnel --config "$NUEVO" ingress validate
echo "Prueba de ruteo: $(cloudflared tunnel --config "$NUEVO" ingress rule "https://$HOST/gassuso" | tail -1)"
install -m 0644 "$NUEVO" "$CFG"; rm -f "$NUEVO"
systemctl restart cloudflared.service
sleep 3; systemctl is-active cloudflared.service
TUNEL=$(awk '/^tunnel:/{print $2}' "$CFG")
echo
echo "Si el DNS de $HOST aún no existe, crearlo (una vez):"
echo "  cloudflared tunnel route dns $TUNEL $HOST"
echo "o en el dashboard de Cloudflare: CNAME pedidos -> $TUNEL.cfargotunnel.com (proxied)."
