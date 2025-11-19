# Docker React

CLI & base image to deploy React applications with docker containers.

## Features

- [x] Configuration
  - [x] Command-line arguments
  - [ ] Configuration file
- [x] Lightweight nginx docker container
- [x] CLI
  - [x] Runtime environment variable injection & validation
    - [x] Javascript
    - [ ] HTML
    - [ ] Hash file for cache invalidation
  - [ ] Application initialization
    - [ ] `index.html` file modification
    - [ ] `Dockerfile` generation
    - [ ] Schema and types generation
- [ ] Support for serving at a path

## Supported Tooling

- Vite

## Supported Validation

- Zod

## Other TODOs

- [ ] Example projects
- [ ] Cookbook for proxying the container with cloudflare
- [ ] Cookbook for handling "in-the-wild" chunks
- [ ] Research plugin possibilities with the supported tooling

## Out of scope

- Server side rendering

## Implementation Instructions

1. Install `docker-react` and `zod` (zod version should match the peer dependency version exactly)

   ```sh
   npm i -S docker-react zod@4.1.12
   ```

2. Create environment variable schema (currently only Zod supported but the future others will be available)

   ```js
   // env.schema.js
   const { z } = require('zod');

   const envSchema = z.object({
     VITE_API_URL: z.string().uri().required(),
   });

   module.exports = envSchema;
   ```

3. Add env import to your `index.html` head (in a future version this will be generated for you)

   ```html
   <head>
     ...
     <script src="/window.env.js"></script>
   </head>
   ```

4. Create `Dockerfile` (in a future version this will be generated for you). NOTE `docker-react` image version version must match your installed npm version of docker-react.

   ```Dockerfile
   FROM demery/docker-react:vX.X.X

   COPY env.schema.js ./env.schema.js
   COPY build /usr/share/nginx/html

   ```

5. Create `.dockerignore`

   ```.dockerignore
   node_modules

   ```

6. Update npm scripts (add the `init-local` command and run it before your local dev scripts)

   ```json
   {
     "dev": "npm run init-local && vite",
     "init-local": "npx docker-react prep -s ./env.schema.js -d public"
   }
   ```

   Note if you are using a `.env` file the current recommended way is to use node directly.
   ```json
   {
     "init-local": "node --env-file=.env ./node_modules/.bin/docker-react prep -s ./env.schema.js -d public"
   }
   ```

   There is a pending feature request for npx commands to support loading .env files directly, once it's implemented these docs will be updated accordingly.
   https://github.com/npm/cli/issues/7069

7. Replace all references to environment variables with `window.env`, eg.
   - `process.env` => `window.env` (for create-react-app and others)
   - `import.meta.env` => `window.env` (for vite)

## Local Testing Instructions

Note: This instructions are to be performed in the **consuming application**.

```sh
# Perform a local production build (using whichever command)
npm run build
# Build a local image tagged with local
docker build -t my-app:local .
# Run local build using the env file
docker run -p 3000:80 --env-file=.env --name=my-app my-app:local
```

The app should now be available at `http://localhost:3000`

```sh
# Cleanup
docker rm my-app && docker image rm my-app:local
```
