FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173

COPY server.mjs ./
COPY public ./public
COPY tools ./tools

EXPOSE 5173

CMD ["node", "server.mjs"]