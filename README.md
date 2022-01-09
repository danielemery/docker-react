# Docker React

CLI & base image to deploy React applications with docker containers.

## Features

- [X] Configuration
  - [X] Command-line arguments
  - [ ] Configuration file
- [X] Lightweight nginx docker container
- [X] CLI
  - [X] Runtime environment variable injection & validation
    - [X] Javascript
    - [ ] HTML
    - [ ] Hash file for cache invalidation
  - [ ] Application initialization
    - [ ] `index.html` file modification
    - [ ] `Dockerfile` generation
    - [ ] Schema and types generation
- [ ] Support for serving at a path

## Supported Tooling

- [ ] Create React App
- [X] Vite
- [ ] React Static

## Supported Validation

- [X] Joi
- [ ] Yup

## Other TODOs

- [ ] Example projects
- [ ] Cookbook for proxying the container with cloudflare
- [ ] Cookbook for handling "in-the-wild" chunks
- [ ] Research plugin possibilities with the supported tooling

## Out of scope

- Server side rendering
