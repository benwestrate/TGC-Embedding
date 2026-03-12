FROM node:22-bookworm-slim AS build

WORKDIR /app/apps/search-ui

COPY apps/search-ui/package*.json ./
RUN npm ci

COPY apps/search-ui ./
RUN npm run build

EXPOSE 3000

# Vite preview serves the built app for production use in this stack.
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
