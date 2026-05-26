FROM node:lts-alpine AS base

RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

FROM base AS deps

COPY package*.json ./
RUN npm ci

FROM deps AS development

ENV CHOKIDAR_USEPOLLING=true
ENV CHOKIDAR_INTERVAL=1000

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY . .

EXPOSE 5000

CMD ["npm", "run", "start:dev"]

FROM deps AS build

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY . .

RUN npm run build
RUN npm prune --omit=dev

FROM node:lts-alpine AS production

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

EXPOSE 5000

CMD ["npm", "run", "start:prod"]
