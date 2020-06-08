FROM node:latest
RUN npm install
CMD [ "node", "index.js" ]