# Playwright's image ships Chromium and its system libraries; keep the tag in step with package.json.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs unwrap-links.mjs ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER pwuser
CMD ["node", "server.mjs"]
