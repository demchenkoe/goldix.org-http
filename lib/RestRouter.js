const {express} = require('./Express');

const {ErrorsParser} = require('./ErrorsParser');
const errorsParser = new ErrorsParser();

class RestRouter {
  /**
   *
   * @param {object} props
   * @param {string} props.id
   * @param {Controller} props.controller
   */
  constructor(props) {
    this.props = {
      ...props
    };
  
    if (!props.controller) {
      throw Error(`RestRouter error: controller is required.`);
    }
    
    if (!props.controller.meta) {
      throw Error(`RestRouter error: controller metadata is required.`);
    }
    
    if (!props.controller.meta.rest) {
      throw Error(`RestRouter error: controller ${props.controller.meta.name} is not support rest.`);
    }
    
    let restOptions = props.controller.meta.rest;
    
    this.router = express.Router();
    
    if(restOptions.middleware) {
      this.router.use(restOptions.middleware);
    }
  
    this.router.use((req, res, next) => {
      
      if(typeof res.success !== 'function') {
        res.success = (data) => res.send(data);
      }
  
      if(typeof res.error !== 'function') {
        res.error = (err) => {
          let { code, httpCode, message, errors } = (restOptions.errorsParser || errorsParser).parse(err, {req, res, context: req.context});
          res.status(httpCode || 200).send({ error: { code, message, errors }});
        };
      }
      
      next();
    });
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
  
  executor(context, req, res, next) {
    let restOptions = context.Action.meta.rest;
    
    try {
      
      if (typeof restOptions.executor === 'function') {
        restOptions.executor(context, req, res, next);
        return;
      }
      
      let params = req.method === 'GET' ? context.params : req.body;
      
      let action = new context.Action({context});
      action.validateParams(params, context)
        .then(params => action.exec(params, context))
        .then(res.success)
        .catch(res.error);
      
    } catch (e) {
      res.error(e);
    }
  }
  
  _bindEndpoints(expressInstance) {
    let logger = expressInstance.logger.get('RestRouter', { method: '_bindEndpoints', controller: this.props.controller} );
    
    if(!this.props.controller || !this.props.controller.meta) {
      logger.warn('controller metadata not found');
      return;
    }
    const ctrlMeta = this.props.controller.meta;
    
    if(!Array.isArray(ctrlMeta.actions) || !ctrlMeta.actions.length) {
      logger.warn('controller actions not found');
      return;
    }
  
    ctrlMeta.actions.forEach(Action => {
      let restOptions = Action.meta.rest;
      if(!restOptions) return;
      let method = restOptions.method.toLowerCase();
      let [uri, queryStr] = restOptions.uri.split('?');
  
      logger.info(`Router "${this.props.id}": New endpoint ${restOptions.method} ${uri}`);
      
      let createContext = (req, res, next) => {
        req.context = {
          router: this,
          Action,
          expressInstance,
          logger: expressInstance.logger,
          user: req.user,
          traceId: req.traceId,
          params: this.pickParams(restOptions.params || {}, req)
        };
        next();
      };
      
      let middleware = [
        createContext
      ];
      
      if (Array.isArray(restOptions.middleware)) {
        middleware = middleware.concat(restOptions.middleware);
      }
      
      this.router[method](uri, middleware, (req, res, next) => {
        this.executor(req.context, req, res, next);
      });
      
    });
  }
  
  bind(expressInstance, {uri} = {}) {
    this._bindEndpoints(expressInstance);
    const ctrlMeta = this.props.controller.meta;
    if(uri) {
      expressInstance.app.use(uri, this.router);
      expressInstance.restRouter(uri, this);
    }
    else if(ctrlMeta.rest && ctrlMeta.rest.baseUri) {
      expressInstance.app.use(ctrlMeta.rest.baseUri, this.router);
      expressInstance.restRouter(ctrlMeta.rest.baseUri, this);
    }
    else {
      expressInstance.app.use(this.router)
      expressInstance.restRouter(null, this);
    }
  }
}

/**
 *
 * @param {Controller} Controller
 * @param {object}  options
 * @param {string}  options.baseUri     will apply as expressApp.use(baseUri, router)
 * @param {array}   options.middleware  will apply as router.use()
 */

RestRouter.meta = (Controller, options) => {
  Controller.meta || (Controller.meta = {});
  Controller.prototype.meta || (Controller.prototype.meta = {});
  
  Controller.meta.rest = Controller.prototype.meta.rest = {
    ...options
  };
};

/**
 *
 * @param Action
 * @param {object}    options
 * @param {array}     options.middleware  will apply as router.get(uri, options.middleware, handler)
 * @param {string}    options.method      GET|POST|PUT|DELETE
 * @param {string}    options.uri         URI with params (for example /users/:uid/profile?fields=)
 * @param {function}  options.executor    function(context, req, res, next) callback what run action
 */

RestRouter.endpoint = (Action, options) => {
  options = endpointOptionsSugar(options);
  if (typeof options.uri !== 'string') {
    throw Error(`RestRouter error: invalid endpoint definition. Option "uri" is required and must be string`);
  }
  
  if (!options.params) { //helps for RestRouter::pickParams
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

function endpointOptionsSugar(options) {
  if(typeof options === 'string' && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s+/.test(options)) {
    let [method, uri] = options.split(/\s+/);
    return {method, uri};
  }
  return options;
}

module.exports = {RestRouter, errorsParser};
