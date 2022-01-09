import Joi from 'joi';

export default Joi.object({
  CLIENT_VERSION: Joi.string(),
});
