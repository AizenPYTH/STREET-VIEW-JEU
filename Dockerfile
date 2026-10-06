# CityGuess — single service: API + websockets + built client
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY db db
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
