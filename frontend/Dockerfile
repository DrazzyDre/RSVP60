# RSVP60 Next.js frontend image (dev-mode container for local Docker Compose).
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3005

# Dev server, bound to 0.0.0.0 so it is reachable from the host.
# NEXT_PUBLIC_API_URL is injected at runtime via docker-compose.
CMD ["npm", "run", "dev", "--", "-p", "3005", "-H", "0.0.0.0"]
