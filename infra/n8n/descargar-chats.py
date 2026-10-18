#!/usr/bin/env python3
"""Descarga los DM de Instagram de @8vobit a un JSON (para analizar flujos de conversación).

Uso en el servidor (lee el token del .env sin mostrarlo):
  sudo sh -c '. /srv/docker/compose/n8n/.env; IG_ACCESS_TOKEN=$IG_ACCESS_TOKEN python3 descargar-chats.py /tmp/chats-8vobit.json'

Los chats tienen datos personales: no subirlos al repo (infra/n8n/chats/ está en .gitignore).
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://graph.instagram.com/v21.0"
TOKEN = os.environ.get("IG_ACCESS_TOKEN")


def get(url, params=None):
    if params is not None:
        params = {**params, "access_token": TOKEN}
        url = f"{url}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Error {e.code}: {e.read().decode()[:300]}")


def paginar(url, params):
    data = get(url, params)
    while True:
        yield from data.get("data", [])
        siguiente = data.get("paging", {}).get("next")
        if not siguiente:
            return
        data = get(siguiente)


def main():
    if not TOKEN:
        sys.exit("Falta IG_ACCESS_TOKEN en el entorno")
    salida = sys.argv[1] if len(sys.argv) > 1 else "chats-8vobit.json"
    yo = get(f"{API}/me", {"fields": "user_id,username"})
    chats = []
    for conv in paginar(f"{API}/me/conversations", {"platform": "instagram", "fields": "id,updated_time,participants", "limit": 50}):
        mensajes = list(paginar(f"{API}/{conv['id']}/messages", {"fields": "id,created_time,from,to,message,attachments", "limit": 50}))
        mensajes.sort(key=lambda m: m.get("created_time", ""))
        chats.append({**conv, "mensajes": mensajes})
        print(f"{conv['id']}: {len(mensajes)} mensajes", file=sys.stderr)
    with open(salida, "w", encoding="utf-8") as f:
        json.dump({"cuenta": yo, "chats": chats}, f, ensure_ascii=False, indent=1)
    print(f"Listo: {len(chats)} conversaciones en {salida}", file=sys.stderr)


if __name__ == "__main__":
    main()
