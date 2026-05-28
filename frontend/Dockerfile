FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --quiet
COPY . .
RUN npm run build

# Second stage: copy the built artefacts to a path that is NOT the volume mount
# point (/app/dist). The compose volume frontend_dist is mounted at /app/dist at
# runtime, which would hide any image-layer files placed there. Instead we keep
# the build at /app/dist_built and the CMD copies into the mounted volume.
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist /app/dist_built
CMD ["sh", "-c", "cp -r /app/dist_built/. /app/dist/ && echo 'Frontend build copied to shared volume'"]
