FROM node:24-alpine AS build
WORKDIR /app

COPY package.json yarn.lock ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=60000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]

EXPOSE 60000
CMD ["node", "backend/dist/app.js"]
