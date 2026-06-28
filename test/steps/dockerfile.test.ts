import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dockerfileStep } from '../../cli/steps/dockerfile.js';
import { buildCtx, makeTempProject } from '../helpers/project.js';

const VERSION = '1.1.0';
const WANT_FROM = `demery/docker-react:v${VERSION}`;

// A Dockerfile on our base image with consumer-added ARG/ENV lines, like a real
// project that has customized the generated file.
const customised = (tag: string) =>
  `FROM demery/docker-react:v${tag}

ARG IMAGE_VERSION
ENV VITE_QUIZLORD_VERSION=$IMAGE_VERSION

COPY env.schema.js ./env.schema.js
COPY dist /usr/share/nginx/html
`;

describe('dockerfile step', () => {
  describe('apply', () => {
    it('creates a pinned Dockerfile when absent', async () => {
      const proj = await makeTempProject();
      const result = await dockerfileStep.apply(buildCtx(proj.root));

      assert.equal(result.changed, true);
      const content = await proj.read('Dockerfile');
      assert.match(content!, new RegExp(`^FROM ${WANT_FROM}$`, 'm'));
      assert.match(content!, /COPY dist \/usr\/share\/nginx\/html/);
      await proj.cleanup();
    });

    it('serves the --build-dir override', async () => {
      const proj = await makeTempProject();
      await dockerfileStep.apply(buildCtx(proj.root, { options: { buildDir: 'build' } }));

      const content = await proj.read('Dockerfile');
      assert.match(content!, /COPY build \/usr\/share\/nginx\/html/);
      await proj.cleanup();
    });

    it('detects build.outDir from the vite config', async () => {
      const proj = await makeTempProject({
        'vite.config.ts': `export default { build: { outDir: 'out' } }`,
      });
      await dockerfileStep.apply(buildCtx(proj.root));

      const content = await proj.read('Dockerfile');
      assert.match(content!, /COPY out \/usr\/share\/nginx\/html/);
      await proj.cleanup();
    });

    it('is a no-op when the FROM tag already matches', async () => {
      const proj = await makeTempProject({ Dockerfile: customised(VERSION) });
      const before = await proj.read('Dockerfile');
      const result = await dockerfileStep.apply(buildCtx(proj.root));

      assert.equal(result.changed, false);
      assert.equal(await proj.read('Dockerfile'), before);
      await proj.cleanup();
    });

    it('bumps only the FROM tag on a stale image, preserving the rest', async () => {
      const proj = await makeTempProject({ Dockerfile: customised('1.0.3') });
      const result = await dockerfileStep.apply(buildCtx(proj.root));

      assert.equal(result.changed, true);
      assert.equal(result.conflict, undefined);
      // The whole file is preserved except the version tag on the FROM line.
      assert.equal(await proj.read('Dockerfile'), customised(VERSION));
      await proj.cleanup();
    });

    it('preserves the body even with --force on a stale image', async () => {
      const proj = await makeTempProject({ Dockerfile: customised('1.0.3') });
      const result = await dockerfileStep.apply(
        buildCtx(proj.root, { options: { force: true } }),
      );

      assert.equal(result.changed, true);
      assert.equal(await proj.read('Dockerfile'), customised(VERSION));
      await proj.cleanup();
    });

    it('leaves a foreign FROM untouched without --force', async () => {
      const foreign = 'FROM node:20-alpine\nRUN echo hi\n';
      const proj = await makeTempProject({ Dockerfile: foreign });
      const result = await dockerfileStep.apply(buildCtx(proj.root));

      assert.equal(result.changed, false);
      assert.equal(result.conflict, true);
      assert.equal(await proj.read('Dockerfile'), foreign);
      await proj.cleanup();
    });

    it('regenerates the template over a foreign FROM with --force', async () => {
      const proj = await makeTempProject({
        Dockerfile: 'FROM node:20-alpine\nRUN echo hi\n',
      });
      const result = await dockerfileStep.apply(
        buildCtx(proj.root, { options: { force: true } }),
      );

      assert.equal(result.changed, true);
      const content = await proj.read('Dockerfile');
      assert.match(content!, new RegExp(`^FROM ${WANT_FROM}$`, 'm'));
      assert.doesNotMatch(content!, /node:20-alpine/);
      await proj.cleanup();
    });
  });

  describe('check', () => {
    it('passes when the FROM tag matches', async () => {
      const proj = await makeTempProject({ Dockerfile: customised(VERSION) });
      const result = await dockerfileStep.check(buildCtx(proj.root));

      assert.equal(result.ok, true);
      await proj.cleanup();
    });

    it('fails when missing', async () => {
      const proj = await makeTempProject();
      const result = await dockerfileStep.check(buildCtx(proj.root));

      assert.equal(result.ok, false);
      assert.equal(result.severity, 'error');
      await proj.cleanup();
    });

    it('directs a stale image to plain init (no --force)', async () => {
      const proj = await makeTempProject({ Dockerfile: customised('1.0.3') });
      const result = await dockerfileStep.check(buildCtx(proj.root));

      assert.equal(result.ok, false);
      assert.match(result.detail!, /docker-react init/);
      assert.doesNotMatch(result.detail!, /--force/);
      await proj.cleanup();
    });

    it('directs a foreign FROM to --force', async () => {
      const proj = await makeTempProject({
        Dockerfile: 'FROM node:20-alpine\n',
      });
      const result = await dockerfileStep.check(buildCtx(proj.root));

      assert.equal(result.ok, false);
      assert.match(result.detail!, /--force/);
      await proj.cleanup();
    });
  });
});
