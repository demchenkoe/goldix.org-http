
const internalServerError = {code: 500, httpCode: 500, message: 'Internal Server Error'};

class ErrorsParser {
  
  parse(err, { req, res, context}) {
  
    if(err instanceof Error || typeof err === 'string') {
      context.logger.get('http').error(err);
    }
  
    if (err && err.constructor === 'ValidationErrors') {
      switch (err.constructor.name) {
        case 'ValidationErrors':
          return {code: 4000, httpCode: 400, message: 'Invalid parameters.', errors: err.errors};
      }
    }
  
    if (typeof err === 'string') {
      switch (err) {
        case 'UNAUTHORIZED':
          return {code: 401, httpCode: 401, message: 'Unauthorized.'};
        case 'PAYMENT_REQUIRED':
          return {code: 402, httpCode: 402, message: 'Payment Required.'};
        case 'FORBIDDEN':
          return {code: 403, httpCode: 403, message: 'Forbidden.'};
        case 'API_ENDPOIND_NOT_FOUND':
          return {code: 404, httpCode: 404, message: 'Invalid endpoint of API.'};
        case 'INTERNAL_SERVER_ERROR':
        default:
          return internalServerError;
      }
    }
    return internalServerError;
  }
}


module.exports = { ErrorsParser };