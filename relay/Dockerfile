FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
ENV PORT=8787 DATA_DIR=/data
VOLUME /data
EXPOSE 8787
CMD ["node", "server.js"]
