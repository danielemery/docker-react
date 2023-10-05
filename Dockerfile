FROM node:18.18.0 as node

FROM nginx
ARG DOCKER_REACT_VERSION

# Grab and link the node binaries from the node image.
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Override default nginx config
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Set working directory
WORKDIR /usr/app

# Install docker-react package globally
RUN npm install -g docker-react@"${DOCKER_REACT_VERSION}"
COPY ./node_modules ./node_modules

# Prepare startup script
COPY ./docker-react-entrypoint.sh /docker-entrypoint.d
