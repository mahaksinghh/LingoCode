FROM node:22-alpine AS build
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
COPY services/api/template/web/src/ /app/services/api/template/web/src/
RUN npm run build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
