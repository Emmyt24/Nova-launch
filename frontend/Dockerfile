# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build-time VITE_ env vars
ARG VITE_API_BASE_URL
ARG VITE_TOKEN_INFO_API_URL
ARG VITE_LEADERBOARD_API_URL
ARG VITE_GOVERNANCE_API_URL
ARG VITE_NETWORK
ARG VITE_FACTORY_CONTRACT_ID
ARG VITE_IPFS_API_KEY
ARG VITE_IPFS_API_SECRET

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage — serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: fall back to index.html for unknown paths
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
