const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

let allExpressApps = {};

class Express {
  
  /**
   * @param options.name
   * @param options.host
   * @param options.port
   * @param options.logger
   */
  
  constructor(options) {
    this.options = {
      host: '127.0.0.1',
      port: 3000,
      ...options
    };
    
    if (allExpressApps[options.name]) {
      throw Error(`Experss error: application name "${options.name}" already exists`);
    }
    allExpressApps[options.name] = this;
    
    this.app = express();
    
    if(this.options.logger) {
      this.logger = typeof this.options.logger.get === 'function' ? this.options.logger.get(options.name) : this.options.logger;
    } else {
      let { LoggerConsole } = require('@goldix.org/logger-console');
      this.logger = new LoggerConsole();
    }
    
    this._restRouters = {};
  }
  
  listen() {
    return new Promise((resolve, reject) => {
      let {host, port} = this.options;
      this.app.listen(port, host, err => {
        if (err) {
          return reject(err);
        }
        this.logger.info(`${this.options.name} listening on http://${host}:${port}`);
        resolve(this.options);
      });
    });
  }
  
  restRouter(uri, restRouter) {
    this._restRouters[uri || '__root'] = restRouter;
  }
}

Express.get = (appName) => {
  if (!allExpressApps.hasOwnProperty(appName)) {
    throw Error(`Experss error: application "${appName}" not found`);
  }
  return allExpressApps[appName];
};


module.exports = {Express, express, cookieParser, bodyParser};