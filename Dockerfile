FROM oven/bun:1

WORKDIR /app

COPY bun.lock package.json ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "run", "start"]