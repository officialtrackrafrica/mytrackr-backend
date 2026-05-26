FROM node:lts-alpine AS base

# Install build tools for native modules (like bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

FROM base AS development

ENV CHOKIDAR_USEPOLLING=true
ENV CHOKIDAR_INTERVAL=1000

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm", "run", "start:dev"]
