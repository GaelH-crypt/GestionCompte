FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --quiet
COPY . .
RUN npm run build

# The built files in /app/dist are used by the nginx container via a shared volume.
# No second stage needed — nginx mounts this volume directly.
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["sh", "-c", "cp -r /app/dist/. /output/ && echo 'Frontend build copied to volume'"]
