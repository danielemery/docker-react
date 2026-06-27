import { z } from 'zod';

export default z.object({
  CLIENT_VERSION: z.url(),
});
