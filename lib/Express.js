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
    
    if (allExpressApps[options.id]) {
      throw Error(`Experss error: application id "${options.id}" already exists`);
    }
    allExpressApps[options.id] = this;
    
    this.app = express();
    
    if(this.options.logger) {
      if(typeof this.options.logger.get !== 'function') {
        throw new Error('Need use logger based on npm @goldix.org/logger-proxy or similar for options inherits feature.');
      }
      this.logger = this.options.logger.get(options.id);
    } else {
      let { LoggerConsole } = require('@goldix.org/logger-console');
      this.logger = new LoggerConsole({ level: 'info' });
    }
    
    this._rests = {};
  }
  
  get baseUri() {
    let {host, port} = this.options;
    return `http://${host}:${port}`
  }
  
  listen() {
    return new Promise((resolve, reject) => {
      let {host, port} = this.options;
      this.app.listen(port, host, err => {
        if (err) {
          return reject(err);
        }
        this.logger.info(`${this.options.id} listening on ${this.baseUri}`);
        resolve(this.options);
      });
    });
  }
  
  rest(uri, restInfo) {
    if(this._rests[uri]) {
      this.logger.warn(`${this.options.id} already has rest router on ${uri}. Will reset old router.`);
    }
    this._rests[uri] = restInfo;
  }
}

Express.get = (appName) => {
  if (!allExpressApps.hasOwnProperty(appName)) {
    throw Error(`Experss error: application "${appName}" not found`);
  }
  return allExpressApps[appName];
};


module.exports = {Express, express, cookieParser, bodyParser};