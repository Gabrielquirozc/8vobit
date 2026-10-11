# Imagen mínima: Node 22 trae node:sqlite, así que no hay npm install.
FROM node:22-alpine
RUN apk add --no-cache tzdata
ENV TZ=America/Santiago NODE_ENV=production HOST=0.0.0.0 PORT=8099 DATA_DIR=/data
WORKDIR /app
COPY server.mjs ./
COPY public ./public
COPY seed ./seed
USER node
EXPOSE 8099
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8099/salud || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
