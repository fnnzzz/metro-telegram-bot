FROM node:latest
WORKDIR ./
RUN npm install
CMD [ "node", "index.js" ]