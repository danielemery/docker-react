FROM node:24.18.0 AS node

FROM nginx:1.31.2
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

# Install docker-react globally. Release builds install the pinned version from
# npm (DOCKER_REACT_SPEC defaults to the npm spec built from DOCKER_REACT_VERSION).
# The e2e/local builds override DOCKER_REACT_SPEC with a packed tarball staged
# into ./e2e/local-pkg/ so the image exercises the working tree, not the release.
ARG DOCKER_REACT_SPEC="docker-react@${DOCKER_REACT_VERSION}"
COPY ./e2e/local-pkg/ /tmp/dr-pkg/
RUN npm install -g "${DOCKER_REACT_SPEC}" && rm -rf /tmp/dr-pkg
COPY ./node_modules ./node_modules

# Prepare startup script
COPY ./docker-react-entrypoint.sh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/docker-react-entrypoint.sh
