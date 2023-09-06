const BabelPluginExtractImportNames = require('./babel-import-extractor.js')
var cacheCode = {};
var bCore = require( "@babel/core" ),
  Util = require('util'),
  path = require('path'),
	JSON5 = require('json5'),

  fileReader = require('../../src/fileReader.js'),
  useSourceMaps = process.env.ENV === 'DEVELOP';

let cache = {};

module.exports = {
  setCache: function(theCache) {
    cache = theCache;
  },
	response: function(req, res, result, staticCache) {
		staticCache['/'+util.path.normalize(result.file.subPath)+'.map'] = {error: false, data: {code: JSON.stringify(result.data.map)}};
		//res.header('X-SourceMap', '/'+util.path.normalize(result.file.subPath)+'.map');
		res.header('X-SourceMap', util.path.normalize(result.file.fileName)+'.map');
	},
  serve: async function(file, code, cfg, additional, staticCache, main){
  	var dependency;
    if( !code ){
      dependency = new fileReader.Dependency();
      code = await dependency.read( file );
    }else{
			dependency = new fileReader.Dependency(file);
      //code = new fileReader.Dependency( file );
    }

		if(additional && additional.route && additional.route.cacheToken){
			dependency.register(typeof additional.route.cacheToken === 'function' ? additional.route.cacheToken(additional): additional.route.cacheToken)
		}
    if(additional && additional.onChange){
    	var listenUpdate = function(fileName) {
    		if(fileName === file.path){
					additional.onChange();
					additional.onChange.uns.forEach(fn => fn());
				}
			};
			(additional.onChange.uns || (additional.onChange.uns = [])).push(
				fileReader.on('update', listenUpdate)
			);
		}

	  var configFile = file.clone(), configObject;
	  configFile.ext = 'json5';
	  if(additional && additional.route && additional.route.input){
		  configObject = Object.assign({}, additional.route.input, {data: null, html: null});

	  }else {
		  try {
			  configObject = JSON5.parse( await dependency.read( configFile ) )
		  } catch( e ) { }
	  }
    /*if( code in cacheCode ){
      return cacheCode[ code ];//.error, cacheCode[code].code)
    }*/
		var baseFile = file;

		const importExtractor = new BabelPluginExtractImportNames();
		const sourceFileName = util.path.normalize(baseFile.subPath);
		const wrapInputPlugin = new JSXTemplateTuner(JSON.stringify( configObject || {} ), configObject && util.path.normalize(configFile.subPath));

		var result = await dependency.result(async function(){
			return await new Promise( function( resolve, reject ){

				bCore.transform(
					code,
					{
						"plugins": [

							[ require( "@babel/plugin-transform-react-jsx" ), {
								"pragma": "D.h", // default pragma is React.createElement
								"pragmaFrag": "D.f", // default is React.Fragment
								"throwIfNamespace": false // defaults to true
							} ],
							//[simpleTransformToAMD]
							[ importExtractor.plugin ],
							[ wrapInputPlugin.plugin ],
							[ require( '@babel/plugin-transform-modules-amd' ) ]
						],
						"generatorOpts": {
							"jsescOption": {
								"minimal": true
							}
						},
						sourceMaps: useSourceMaps,
						sourceFileName: sourceFileName,
						moduleId: sourceFileName
					}, async function( err, d, e ){
						if( err ){
							cacheCode[ code ] = { error: new Error( err.message ) };
							console.error(err);
							resolve( cacheCode[ code ] );
						}else{
              var mapImports = {};
							var imports = await Promise.all( importExtractor.state.map( async item => {


								var {file, data} = await util.path.resolve( item.from, baseFile, config.template );
    						var ext = item.from.split('.').pop();
								if(!file){
                  mapImports[item.from] = item;
									if(ext.length>5){
										var {file, data} = await util.path.resolve( item.from+'.jsx', baseFile, config.template );
										if(file) {
                      item.from += '.jsx';
                      item.nodeFrom.value += '.jsx';
                    }

										if(!file){
											var {file, data} = await util.path.resolve( item.from+'.js', baseFile, config.template );
											if(file) {
                        item.from += '.js';
                        item.nodeFrom.value += '.js';
                      }
										}
									}
								};

								dependency.register(file)
								return { base: baseFile, file: item.from, resolved: file, pos: item.fromLocation };
								file = file[ 0 ].replace( /\\/g, '/' );
								if( !( ( '/' + util.path.getDisplayName( file ) ) in cache ) ){
									// add to cache
									try{
										var resolved = require.resolve( item.from, {
											paths: [ path.parse( path.resolve( fileName ) ).dir ].concat( module.paths )
										} );
									}catch( e ){
										console.error( 'can not resolve ' + fileName )
									}
									if( resolved ){
										cache[ '/' + util.path.normalize( file ) ] = `define("${util.path.normalize( item.from )}", ["exports"], function(_exports){${
											await fileReader.read( resolved )
										};_exports.default = ${item.name};_exports.__esModule = true;});`
									}
								}
							} ) );

							var failed = imports.filter( a => !a.resolved );
							if( failed.length ){
								console.log(`ERROR: JSX '${baseFile.subPath}' Can not resolve: ${failed.map(f=>f.file).join(',')}`);
								return reject( failed )
							}

              d.code = d.code.replace(/(define\("[^"]*",\s*)(\[[^\]]*\])/, function(a,b,c){
                return b+JSON.stringify(JSON.parse(c).map(function(name){
                    if(!(name in mapImports))
                      return name;

                    return mapImports[name].from;
                }))
              });

							cacheCode[ code ] = { error: false, data: d, file: baseFile };
							resolve( cacheCode[ code ] );
						}
					} );
			} );
		}, this.main.fileChanged);

		return result;
  }
};
const template = require('@babel/template');
const {declare} = require('@babel/helper-plugin-utils');
class JSXTemplateTuner {
	constructor(cfg, fileName) {
		this.plugin = declare(api => {
			return {
				visitor: {
					Program(path) {
						var functions = {};
						for( var i = 0, _i = path.node.body.length; i < _i; i++ ){
							var bodyElement = path.node.body[ i ];

							if( bodyElement.type === 'FunctionDeclaration' ){
								functions[ bodyElement.id.name ] = bodyElement
							}
						}
						var noExport = true;
						for( var i = 0, _i = path.node.body.length; i < _i; i++ ){
							var bodyElement = path.node.body[ i ];
							if(bodyElement.type === 'ExportDefaultDeclaration'){
								var declaration = bodyElement.declaration;
								var shouldExtend = false;

								if(declaration.type === 'Identifier'){
									if(declaration.name in functions){
										declaration = functions[ declaration.name ];
									}
								}

								if(declaration.type === 'FunctionDeclaration'){
									for( var j = 0, _j = declaration.params.length; j < _j; j++ ){
										var param = declaration.params[ j ];
										if(param.name === 'input'){
											shouldExtend = true;
											break;
										}
									}
									if(shouldExtend){
										noExport = false;
										declaration.body.body.unshift(template.default.ast('input = inheritConfig( input );'));
									}
								}else if(declaration.type === 'Identifier'){
									noExport = false;
									bodyElement.declaration = template.default.ast(`function Wrapper(input, children){return ${declaration.name}.call(this, inheritConfig( input ), children);}`);
								}
							}
						}

						if(noExport){
							var imports = [], other = [], scope = {anyJSX: false};
							for( var i = 0, _i = path.node.body.length; i < _i; i++ ){
								var bodyElement1 = path.node.body[ i ];
								if(bodyElement1.type === 'ImportDeclaration'){
									imports.push(bodyElement1);
								}else{
									other.push(bodyElement1);
								}
							}
							var wrapper = template.default.ast(`export default function Template(input, children){if(!(this instanceof Template))return new Template(input, children);input = inheritConfig( input ); this.dom = [];}`);
							for( var i = 0, _i = other.length; i < _i; i++ ){
								wrapper.declaration.body.body.push(pushJSXs(other[ i ], scope))
							}
							if(scope.anyJSX){
								wrapper.declaration.body.body.push(template.default.ast(`(this.dom.length < 2) && (this.dom = this.dom[0])`));
								path.node.body = imports.concat( wrapper );
							}
						}

						path.node.body.unshift(template.default.ast(`const __store = ${fileName?`window.__store['${fileName}'] = `:''}new Store(${cfg}), blockConfig = __store.bindings(), inheritConfig = new ConfigInheriter(blockConfig);`));
						fileName && path.node.body.unshift(template.default.ast(`(!window.__store) && (window.__store = {});`));
					}
				}
			}
		})
	}
}
var pushJSXs = function(node, scope) {
	if(node.type === 'ExpressionStatement'){
		if(node.expression.type === 'JSXElement' || node.expression.type === 'JSXFragment' || node.expression.type === 'JSXExpressionContainer'){
			scope.anyJSX = true;
			var pushAST = template.default.ast(`this.dom.push();`);
			pushAST.expression.arguments.push(node.expression);
			return pushAST;
		}
	}
	return node;
}
