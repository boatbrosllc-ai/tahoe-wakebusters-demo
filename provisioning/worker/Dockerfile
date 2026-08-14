FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx@4.19.2 --no-save
COPY lib/provisioning ./lib/provisioning
COPY provisioning/worker ./provisioning/worker
ENV NODE_ENV=production
ENV PROVISIONING_RUNTIME=cloudrun
EXPOSE 8080
CMD ["npx", "tsx", "provisioning/worker/server.ts"]
