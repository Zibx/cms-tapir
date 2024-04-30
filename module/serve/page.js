const BabelPluginExtractImportNames = require('./babel-import-extractor.js')
var cacheCode = {};
var bCore = require( "@babel/core" ),
  Util = require('util'),
  path = require('path'),

  fileReader = require('../../src/fileReader.js'),
  useSourceMaps = process.env.ENV === 'DEVELOP';

let cache = {};

var jsx = require('./jsx.js');
var cachedCache = {};
const { minify } = require("terser");

const isDevelop = process.env.ENV === 'DEVELOP';

module.exports = {
  setCache: function(theCache) {
    cache = theCache;
  },
	response: function(req, res) {
		res.set('Content-Type', 'text/html');
		res.set('Cache-Control', 'max-age='+(60*60*24));
	},
  serve: async function(file, code, config, additional){
  	var result;
    var dependency = new fileReader.Dependency();
    var html = additional && additional.route && additional.route.html || config.html;
    var resolved = await util.path.resolve(html, null, config.template);
    if(!resolved){
    	console.error(`ERROR Cannot serve: '${file.path}' because can not resolve '${html}'`);
    	return false;
		}
    var htmlData = await dependency.read(resolved);
		var js = await jsx.serve(file, code, config, additional);
		var serveConfig = config;

		// TODO rename!!!
		var config = {};
		if(htmlData && (js && !js.error)){
			var cachedBundle = '';
			if(additional.route.cache){
				if( !isDevelop ){
					var cacheLine = additional.route.cache.join( ';;' );
					if( cacheLine in cachedCache ){
						cachedBundle = cachedCache[ cacheLine ];
					}else{
						var clearCacheLine = function(){
							delete cachedCache[ cacheLine ];
						};
						var all = await Promise.all( additional.route.cache.map( async function( name ){
							try{
								return await additional.main.serve( name, null, clearCacheLine )
							}catch( e ){
								return false;
							}
						} ) );
						try{
							cachedCache[ cacheLine ] = cachedBundle = ( await minify( all.reverse().filter( a => a ).map( a => a.data.code ).join( ';' ) ) ).code;
						}catch( e ){
							console.error( 'Cache minification error' )
						}
					}
				}
			}
			var cachedScripts = '';

				if( additional.main.config.scripts ){
					if( !isDevelop ){
					var cacheScriptsFileName = `/__cache${file.subPath.replace( /[\\\/]/g, '_' )}.js`;
					var clearStaticCacheFile = function(){
						additional.main.clearStatic( cacheScriptsFileName );
					};

					if( !additional.main.isStatic( cacheScriptsFileName ) ){
						var all = await Promise.all(
							[].concat.apply([], additional.main.config.scripts)
								.map( async function( name ){
									try{
										console.log(name);
										return await additional.main.complexServe( name, null, clearStaticCacheFile )
									}catch( e ){
										console.error(e);
										console.log(name+' fail');
										return false;
									}
								} ) );
						try{
							additional.main.setStatic( cacheScriptsFileName, ( await minify( all.filter( a => a ).map( a => a.data.code ).join( ';' ) ) ).code )
							cachedScripts = `<script src="${cacheScriptsFileName}"></script>`;
						}catch( e ){
							console.error( 'Cache minification error', e )
						}
					}else{
						cachedScripts = `<script src="${cacheScriptsFileName}"></script>`;
					}
					}else{
						cachedScripts = [].concat.apply([], additional.main.config.scripts)
							.map(fileName => `<script src="${fileName}"></script>`).join('\n');
					}
				}

			var inputs = Object.assign({}, additional.scope, {
				scripts: cachedScripts,
				pageCode: cachedBundle+js.data.code+`
    define('start', ['${util.path.normalize(file.subPath)}'], function(main) {
      D.appendChild(document.body, main.default(
        new Store(${JSON.stringify(config)}).bindings()
      ))
    });`
			});
			if(additional && additional.route && additional.route.input){
				inputs = Object.assign(inputs, additional.route.input);
			}
			var finalHTML = htmlData;

			for(var key in inputs) {
        if( typeof inputs[ key ] === 'function' ) {
          inputs[ key ] = await inputs[ key ].call( inputs, key );
        }
      }

			for(var key in inputs){
				finalHTML = finalHTML.replace(new RegExp('%'+key.toUpperCase()+'(?::([a-zA-Z_]+))?%', 'g'), function(full, operations){
					var out = full;
				  if(typeof inputs[key] === 'object') {
						out = JSON.stringify( inputs[ key ] )
					}else if(typeof inputs[key] === 'function'){
						out = inputs[key].call(inputs, key); // function call
					}else{
						out = inputs[key];
					}
					if(operations){
						if(!serveConfig.userFunctions){
							console.error('User functions are not declared in the Tapir config');
							return out;
						}

						if(!(operations in serveConfig.userFunctions)){
							console.error(`User function ${operations} is not declared in the Tapir config`);
							return out;
						}

						return serveConfig.userFunctions[operations].call(inputs, out);
					}
					return out;
				});

			}

			result = {error: false, data: {
					code: finalHTML
				}
			};
		}else{
			result = {error: true, data: []};
		}

		return result;
  }
}