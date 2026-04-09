FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY frontend/ ./
RUN yarn build

FROM node:24-alpine AS backend-build
WORKDIR /app/backend

COPY backend/package.json backend/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY backend/ ./
RUN yarn build

FROM node:24-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=60000

COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package.json ./package.json
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

RUN mkdir -p /app/backend/data
VOLUME ["/app/backend/data"]

EXPOSE 60000
CMD ["node", "dist/app.js"]
