const {express} = require('./Express');
const utils = require('@goldix.org/utils');

class Rest {
  /**
   *
   * @param {object} options
   * @param {string} options.id
   * @param {array}  options.controllers  array with Controllers
   * @param {object} options.logger
   */
  constructor(options) {
    this.options = {
      ...options
    };
    
    if (!options.controllers) {
      throw Error(`Rest error: option controllers is required.`);
    }
  
    if(this.options.logger) {
      if(typeof this.options.logger.get !== 'function') {
        throw new Error('Need use logger based on npm @goldix.org/logger-proxy or similar for options inherits feature.');
      }
      this.logger = this.options.logger.get(options.id);
    } else {
      let { LoggerConsole } = require('@goldix.org/logger-console');
      this.logger = new LoggerConsole({ level: 'error' });
    }
  }
  
  pickParams({uri, query}, req) {
    let params = {};
    if (!req) return params;
    
    if (req.query && Array.isArray(query)) {
      query.forEach(k => params[k] = req.query[k]);
    }
    if (req.param && Array.isArray(uri)) {
      uri.forEach(k => params[k] = req.param[k]);
    }
    
    return params;
  }
  
  
  formatError(err) {
    let context;
    let httpCode = 200;
    let result = {
      hash: undefined,
      code: undefined,
      message: typeof err === 'string' ? err : (err.message || 'INTERNAL_SERVER_ERROR'),
      details: undefined
    };
  
    if(err && err.constructor && err.constructor.name === 'ActionError') {
      let { errorOptions, details } = err.payload  || {};
      context = err.payload.context;
      result.hash = err.payload.hash;
      if(errorOptions.message) {
        result.message = errorOptions.message;
      }
      details && (result.details = details);
      errorOptions.code && (result.code = errorOptions.code);
      !result.details && errorOptions.details && (result.details = errorOptions.details);
      
      if(errorOptions.httpCode) {
        httpCode = errorOptions.httpCode;
      }
    } else {
    
      if (/[A-Z_\d]{10}/.test(result.message) && result.message.indexOf('_') !== -1) {
        result.hash = result.message;
      }
    }
  
    if(result.hash) {
      if(context && context.i18n) {
        result.message = context.i18n._(result.hash)
      }
      result.message || (result.message = result.hash);
    }
    
    return {
      httpCode,
      response: { error: result }
    };
  }
  
  executor(context, req, res, next) {
    let restOptions = context.Action.meta.rest;
    
    try {
      
      if (typeof restOptions.executor === 'function') {
        restOptions.executor(context, req, res, next);
        return;
      }
      
      let params = req.method === 'GET' ? context.params : req.body;
      
      let action = new context.Action({context});
      action
        .exec(params)
        .then(res.success)
        .catch(res.error);
      
    } catch (e) {
      res.error(e);
    }
  }
  
  _buildExpressRouter(Controller) {
    let restOptions = Controller.meta.rest;
    
    let router = express.Router();
    
    if (restOptions.middleware) {
      router.use(restOptions.middleware);
    } else if (this.options.middleware) {
      router.use(this.options.middleware);
    }
    
    router.use((req, res, next) => {
      
      if (typeof res.success !== 'function') {
        res.success = (data) => res.send(data);
      }
      
      if (typeof res.error !== 'function') {
        res.error = (err) => {
          let formatError = null;
          if (req.context) {
            formatError =
              utils.get(req.context, 'Action.meta.rest.formatError')
              || utils.get(req.context, 'Controller.meta.rest.formatError');
          }
          if (!formatError) {
            formatError = this.formatError.bind(this);
          }
          
          const {httpCode, response} = formatError(err, {
            req,
            res,
            context: req.context,
            options: {
              ...this.options,
              ...restOptions
            }
          });
          res.status(httpCode || 200).send(response);
        };
      }
      
      next();
    });
    
    return router;
  }
  
  _bindControllerActionsToRouter({expressInstance, router, Controller}) {
    let baseUri = expressInstance.baseUri + Controller.meta.rest.baseUri;
    
    Controller.meta.actions.forEach(Action => {
      let restOptions = Action.meta.rest;
      if (!restOptions) return;
      let method = restOptions.method.toLowerCase();
      let [uri, queryStr] = restOptions.uri.split('?');
  
      this.logger && this.logger.info(` + endpoint ${restOptions.method} ${baseUri}${restOptions.uri} (${Controller.meta.id}/${Action.meta.id})`);
      
      let createContext = (req, res, next) => {
        req.context = {
          Controller,
          Action,
          expressInstance,
          logger: expressInstance.logger,
          user: req.user,
          traceId: req.traceId,
          transportName: 'Rest',
          transport: this,
          router,
          params: this.pickParams(restOptions.params || {}, req),
          originalExecutor: this.executor.bind(this)
        };
        next();
      };
      
      let middleware = [
        createContext
      ];
      
      if (Array.isArray(restOptions.middleware)) {
        middleware = middleware.concat(restOptions.middleware);
      }
      
      router[method](uri, middleware, (req, res, next) => {
        this.executor(req.context, req, res, next);
      });
      
    });
  }
  
  bind(expressInstance, options) {
    let loggerPrefix = `Rest${this.options.id ? ' "' + this.options.id + '"' : ''}:`;
    
    if (!Array.isArray(this.options.controllers)) {
      this.logger && this.logger.warn(`${loggerPrefix} controllers not found`);
      return;
    }
    
    this.options.controllers.forEach(Controller => {
      let controllerName = Controller.meta && Controller.meta.id;
      if (!controllerName && Controller.constructor) controllerName = Controller.constructor.name;
      
      if (!Controller || !Controller.meta) {
        this.logger && this.logger.warn(`${loggerPrefix} Controller "${controllerName}" metadata not found`);
        return;
      }
      
      if (!Controller.meta.rest) {
        this.logger && this.logger.warn(`${loggerPrefix} Controller "${controllerName}" is not REST controller. Use Rest.controller(Controller) for declare rest options. Controller ignored for REST.`);
        return;
      }
  
      this.logger && this.logger.info(`${loggerPrefix} Controller "${controllerName}" is applying to ${expressInstance.options.id}...`);
      
      if (!Array.isArray(Controller.meta.actions) || !Controller.meta.actions.length) {
        this.logger && this.logger.warn(`${loggerPrefix} Controller "${controllerName}" actions not found`);
        return;
      }
      
      let router = this._buildExpressRouter(Controller);
      let baseUri = Controller.meta.rest.baseUri;
      this._bindControllerActionsToRouter({expressInstance, router, Controller});
      
      expressInstance.app.use(baseUri, router);
      expressInstance.rest(baseUri, {router, Controller, rest: this, baseUri});
    });
  }
}

/**
 *
 * @param {Controller} Controller
 * @param {object}  options
 * @param {string}  options.baseUri     will apply as expressApp.use(baseUri, router)
 * @param {array}   options.middleware  will apply as router.use()
 */

Rest
  .controller = (Controller, options) => {
  if (!Controller.meta) {
    Controller.meta = Controller.prototype.meta = {};
  }
  
  Controller.meta.rest = Controller.prototype.meta.rest = {
    ...controllerOptionsSugar(options)
  };
};

function

controllerOptionsSugar(options) {
  if (typeof options === 'string') {
    return {baseUri: options};
  }
  return options;
}

/**
 *
 * @param Action
 * @param {object}    options
 * @param {array}     options.middleware  will apply as router.get(uri, options.middleware, handler)
 * @param {string}    options.method      GET|POST|PUT|PATCH|DELETE|OPTIONS
 * @param {string}    options.uri         URI with params (for example /users/:uid/profile?fields=)
 * @param {function}  options.executor    function(context, req, res, next) callback what run action
 */

Rest
  .action = (Action, options) => {
  options = actionOptionsSugar(options);
  if (typeof options.uri !== 'string') {
    throw Error(`Rest error: invalid endpoint definition. Option "uri" is required and must be string`);
  }
  
  if (!options.params) { //helps for Rest::pickParams
    let [uri, queryStr] = options.uri.split('?');
    options.params = {
      uri: (uri.match(/\:[\w\d]+/gm) || []).map(v => v.substr(1)),
      query: queryStr && queryStr.split('&').map(v => v.substr(0, v.length - 1))
    };
  }
  Action.meta || (Action.meta = {});
  Action.prototype.meta || (Action.prototype.meta = {});
  Action.meta.rest = Action.prototype.meta.rest = {
    method: 'GET',
    ...options
  };
};

function

actionOptionsSugar(options) {
  if (typeof options === 'string' && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s+/.test(options)) {
    let [method, uri] = options.split(/\s+/);
    return {method, uri};
  }
  return options;
}

module.exports = {Rest};
