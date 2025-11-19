const { z } = require('zod');

const envSchema = z.object({
  CLIENT_VERSION: z.string().uri().required(),
});

module.exports = envSchema;
