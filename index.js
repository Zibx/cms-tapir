require('dotenv').config();
const fs = require( 'fs' ),
  path = require('path'),

  JSON5 = require('json5'),

  env = process.env,
  compression = require('compression'),
  HOST = env.HOST || '0.0.0.0',
  PORT = env.PORT || 7373,
  App = require('express'),
  app = App(),
  {execSync} = require('child_process'),
  Observable = require('./src/core/Observer.js');

require('./util.js');

const CACHE_ENABLED = !process.env.DISABLE_CACHE;
const useSourceMaps = env.ENV === 'DEVELOP';

//var jsx = require('./src/transform/jsx.js');

var cache = {};
var lives = [];
var log = [];

var fileReader = require('./src/fileReader.js');

var paths = {};

/*var serveSVG = require('./src/serve/svg.js');
serveSVG.setCache(cache, !CACHE_ENABLED);

var serveScss = require('./src/serve/scss.js');
serveScss.setCache(cache, !CACHE_ENABLED);
jsx.setCache(cache, !CACHE_ENABLED);*/
app.use('/template', async function(req, res, next){
  var fileName = req.originalUrl;
  var ext = '.'+fileName.split('.').pop(),
      error = false;

  if(ext === '.svg'){
    try{
      await serveSVG.serve( fileName, req, res, next );
    }catch(e){
      error = true;
    }
  }else if(ext === '.scss'){
    try{
      await serveScss.serve( fileName, req, res, next )
    }catch(e){
      error = true;
    }
  }else{
    error = true;
  }
  if(error)
    next();
});



global.Observable = require('./src/core/Observer.js');
/*process
  .on('unhandledRejection', (reason, p) => {
    debugger
    console.error(reason, 'Unhandled Rejection at Promise', p);
    //fs.appendFileSync(path.join(__dirname,'tmp/log'), new Date().toISOString()+'\n'+reason+'\n\n');
  })
  .on('uncaughtException', (err, p) => {
    debugger
    console.error(err, 'Unhandled Rejection at Promise', p);

    //fs.appendFileSync(path.join(__dirname,'tmp/log'), new Date().toISOString()+'\n'+err.stack+'\n\n');
  });*/

app.disable('x-powered-by');

const dir = global.dir = function(...args) {
  if([...args][0] === void 0 )debugger
  return path.join.apply(path, [__dirname, ...args]);
};
dir.path = __dirname;

let appScope = {env: {}};

let commit, commitNUMBER, lastUpdateNumber;
const updateCommitInfo = function() {
  try{
    commit = execSync( 'git rev-parse HEAD' ).toString().trim();
    if( !lastUpdateNumber || (lastUpdateNumber + 120000 < +new Date()) ){
      lastUpdateNumber = +new Date()
      commitNUMBER = execSync( 'git rev-list --count HEAD' ).toString().trim();
      appScope.env.commit = commitNUMBER;
    }
  }catch(e){
    console.error('This project is not a git repository')
  }
};
var Dir = require('./dir');

updateCommitInfo();
var CMS = function(cfg) {
  if(!cfg)
    cfg = {};

  if(!cfg.base && module.parent)
    cfg.base = module.parent.path;

  this.__cfg = cfg;
  Observable.call(this);
  util.deepAssign(this, {config: this.normalizePaths(this.defaultConfig(), __dirname)});
  util.deepAssign(this, {config: this.normalizePaths(cfg.config, cfg.base)});

  if(typeof cfg.routes === 'string'){
    var routesFile = new Dir.File(cfg.base, cfg.routes);
    this._readRoutes(routesFile);
  }else{
    this._initRoutes(cfg.routes);
  }
  
  this.modules = [];
  this.modulesHash = {};
  this.scope = appScope;
  this.init();
};
CMS.prototype = {
  _readRoutes: async function(routesFile) {
    //console.log(123, routesFile)

    var data = await fileReader.read(routesFile);
    //console.log(data)
  },
  _initRoutes: function(routes) {
    this.routes = Object.assign( {}, this.routes );
    this.routes = Object.assign( this.defaultRoutes(), routes );
    
    // deal with multiple path routes
    for(var route in this.routes){
      if(route.indexOf(',')>-1){
        var subRoutes = route.split(',');
        subRoutes.forEach((subRoute)=>{
          var trimmed = subRoute.trim();
          this.routes[trimmed] = Object.assign({
            baseRoute: route,
            subRoute: trimmed
          }, this.routes[route]);          
        });
        delete this.routes[route];        
      }
    }
    
    // separate templated routes
    this.templateRoutes = [];
    for(var route in this.routes){
      if(route.indexOf('*')>-1){
        this.templateRoutes.push({
          route, info: this.routes[route], 
          regexp: new RegExp(
            '^'+
            route
              .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
              .replace(/\*/g, '(.*)')
            +'$'
          )
        });
        
        delete this.routes[route];
      }
    }
  },
  extendAPI: function(routes) {
    this.api(routes);
  },
  defaultConfig: ()=> Object.assign({}, require('./config/config.js')),
  defaultRoutes: ()=> Object.assign({}, require('./config/route.js')),
  normalizePaths: function(cfg, base) {
    var copy = {...cfg};
    !(Array.isArray(copy.static)) && (copy.static = [copy.static]);
    copy.static = copy.static.slice();
    copy.static = copy.static.map(item => new Dir(base || __dirname, item));

    !(Array.isArray(copy.template)) && (copy.template = [copy.template]);
    copy.template = copy.template.slice();
    copy.template = copy.template.map(item => new Dir(base || __dirname, item));

    if(copy.scss && copy.scss.path){
      copy.scssBaseDir = copy.template.map( item => {
        return new Dir(item.base, path.join( item.dir, copy.scss.path ));
      } )
    }

    return copy;
  },
  init: function() {

    var actual = this.actual = {
      PORT: this.config.port || PORT,
      HOST: this.config.host || HOST,
      USE_HTTPS: this.config.useHttps || env.USE_HTTPS,
    };
    var base = this.base || __dirname;


    for(var moduleName in this.config.modules){
      if(this.config.modules[moduleName]){
        moduleName = moduleName.replace(/[^a-zA-Z_\-0-9]/g,'');
        var module = require('./module/'+moduleName+'.js')
        new module(this);
      }
    }

    const projectDir = global.projectDir  = function(...args) {
      return path.join.apply(path, [base, ...args]);
    };
    projectDir.path = base;

    const R = new App.Router,
      Tapir = require('api-tapir'),
      api = new Tapir({
        timeout: 6666,
        router: R,
        docs: 'GET:/api'
      });
    this.R = R;
    this.api = api;
    var config = global.config = this.config;
    var route = this.route;


    var app = this.app = App()

    app.use(compression());


    app.use(this.getModule('Serve').middleware);

    config.static.forEach(dir => {
      console.log('STATIC: ', dir.path)
      app.use(App.static(dir.path));
    });

    api(this.currentAPI = this.__cfg.api || {});

    app.use(R);
    
    this.getModule('Pattern') && app.use(this.getModule('Pattern').middleware);
    
    
    this.fire('afterInit');
    setTimeout(()=>this.updateCheck(), 10000);
    setInterval(()=>this.updateCheck(), 60000*60*24);
    return ;
    var generateServe = function(pathName, useConfig) {
      return async function(req, res, next){
        if(req.originalUrl.match(/\.scss?$/)!==null){
          return await serveScss.serve('template/'+req.originalUrl, req, res, next)
        }
        if(req.originalUrl.match(/\.svg?$/)!==null){
          return await serveSVG.serve('template/'+req.originalUrl, req, res, next)
        }
        if(req.originalUrl.match(/\.jsx\.map?$/)!==null){
          return next()
        }
        var dependency = new fileReader.Dependency(),
          blockName = req.originalUrl.substr( ('/'+pathName).length + 1 );// args.name;


        var blockPath = `./template/${pathName}/${blockName}`,
          blockCode = await dependency.read( blockPath ),
          config = {},
          configPath = blockPath.replace(/\.jsx?$/, '.json5');
        if(useConfig){
          try{
            config = JSON5.parse( await dependency.read( configPath ) );
          }catch( e ){

          }
        }
        var map;
        try{
          var result = await dependency.result( async function(){

            var code = await jsx.transformJSX(
              (

                (useConfig?`const blockConfig = new Store(${JSON.stringify( config )}).bindings(), inheritConfig = new ConfigInheriter(blockConfig);`:'')+
                `${blockCode.trim().indexOf( '<' ) === 0 ?
                  `var declaration = D.declare("${pathName}/${blockName}", function(input){
${useConfig?`input = inheritConfig(input);`:''}return (<>
              
              
${blockCode}


</>);});export default declaration;` : blockCode
                }` ),

              `${pathName}/${blockName}`,

              dependency,
              blockPath
            );
            map = code.map;
            return code.code;

          } );
          console.log( `${pathName}/${blockName}`)
          if(CACHE_ENABLED) {
            cache[ `/${pathName}/${blockName}` + '.map' ] = JSON.stringify( map );
          }
          res.set( 'SourceMap', `/${pathName}/${blockName}` + '.map' );
          res.set( 'Content-type', 'application/javascript; charset=UTF-8' );

          res.end(result)
        }catch( e ){
          res.end(JSON.stringify({error: true, data:e.message}));
          /*debugger
          next();*/
        }
      };
    }
    app.use('/block', generateServe('block', true));
    app.use('/component', generateServe('component'));
    app.use('/util', generateServe('util'));

    for(var key in route){
      let currentRoute = route[key];
      paths['GET:'+key] = {
        headers: {
          "Content-Type": "text/html; charset=utf-8"
        },
        description: `Page ${key}`,
        fn: async function() {

          var dependency = new fileReader.Dependency();

          var cmsPage;
          try{
            cmsPage = await dependency.read('./src/page.html');
          }catch(e){
            cmsPage = await dependency.read(dir('./src/cms.html'));
          }
          var pageCode = await dependency.read(`./template/page/${currentRoute.page}.jsx`),
            config = {};

          try{
            config = JSON5.parse(await dependency.read( `./template/page/${currentRoute.page}.json5` ));
          }catch( e ){

          }

          return await dependency.result(async function() {
            var code = await jsx.transformJSX(
              pageCode.indexOf('export '>-1)?
                pageCode :
                `export default ${pageCode.trim().indexOf('<') !== 0 ? pageCode :
                  `(input)=>{return <>${pageCode}</>}`
                }`,

              `page/${currentRoute.page}.jsx`,

              dependency,
              `template/page/${currentRoute.page}.jsx`
            );

            var inputs = Object.assign({}, appScope, {
              pageCode: code.code+`
    define('start', ['page/${currentRoute.page}.jsx'], function(main) {
      D.appendChild(document.body, main.default(
        new Store(${JSON.stringify(config)}).bindings()
      ))
    });`
            });
            var finalHTML = cmsPage;
            for(var key in inputs){
              finalHTML = finalHTML.replace(new RegExp('%'+key.toUpperCase()+'%', 'g'), typeof inputs[key] === 'object' ? JSON.stringify(inputs[key]): inputs[key])
            }

            return finalHTML;

          });
        }
      };
    }
    api(paths);//{'GET:/': {fn: ()=>2}})
//app.use(compression());

    app.use(R);
    config.static.forEach(dir => {
      console.log('STATIC: ', dir.path)
      app.use(App.static(dir.path));
    });
    //debugger

    app.use('/', function(req, res, next){
      //console.log( req.originalUrl )

      if( req.originalUrl === '/[live]' ){
        lives.push( res );
      }else if( req.originalUrl === '/log' ){
        if(req.method === 'GET'){
          res.end(JSON.stringify(log))
        }else{
          log.push( req.body );
          res.end('OK')
        }

      }else if( req.originalUrl in cache ){
        res.end( cache[ req.originalUrl ] );
      }else{
        next();
      }
    });
    var debounce = {}, shouldUpdate = false;
    var Store = require('./src/core/data/store/Store.js');

    var doUpdate = Store.debounce(async function(){

      var files = [];
      for( let filename in debounce ){
        try{
          if(filename.substr(-4)==='.jsx'){

            var req = {url: '/'+path.posix.relative(config.template, filename)}
            debugger

            var dependency = new fileReader.Dependency(),
              blockName = req.url.substr( '/block'.length + 1 );// args.name;


            var blockPath = `./template/block/${blockName}`,
              blockCode = await dependency.read( blockPath ),
              blockConfig = {},
              configPath = blockPath.replace( /\.jsx?$/, '.json5' );

            try{
              blockConfig = JSON5.parse( await dependency.read( configPath ) );
            }catch( e ){

            }
            var map;
            var result = await dependency.result( async function(){

              var code = await jsx.transformJSX(
                ( `const blockConfig = new Store(${JSON.stringify( blockConfig )}).bindings(), inheritConfig = new ConfigInheriter(blockConfig);
${blockCode.trim().indexOf( '<' ) === 0 ?
                  `var declaration = D.declare("block/${blockName}", function(input){
input = inheritConfig(input); return (<>
              
              
${blockCode}


</>);});export default declaration;` : blockCode
                }` ),

                `block/${blockName}`,

                dependency,
                blockPath
              );
              map = code.map;
              return code.code;

            } );
            if(CACHE_ENABLED) {
              cache[ req.url + '.map' ] = JSON.stringify( map );
            }

            var url = '/' + path.relative( './'+config.template, filename ).replace( /\\/g, '/' )

            console.log( 'Live transform jsx ', url )
            files.push( { file: url, content: result } );
            //}
            /*else if(filename.substr(-3)==='.js'){
          var code = await readFile( filename ) + '';
          var url = '/' + path.relative( './src', filename ).replace( /\\/g, '/' )
          console.log( 'Live transform js ', url )
          var result = await transformJSPromised( code, url );
          files.push( { file: url, content: result.code } );
        }*/
          }
        }catch( e ){

          console.log( 'Error in ' + e );
        }
        delete debounce[filename];

      }
      var live, liveUpdate = JSON.stringify(files);
      while((live = lives.pop()))
        live.end(liveUpdate);
      shouldUpdate = false;
    }, 100);

    fileReader.on('update', function(name) {
      debounce[name] = true;
      doUpdate();
    });


    console.log(`Tapir-CMS ENV: ${env.ENV}`);

  },
  registerModule: function(name, module) {
    this.modules.push({name, module});
    this.modulesHash[name] = module;
    module.init();
    if(module.expose){
      module.expose.forEach( name => {
        console.log( 'Exposed', name )

        this[ name ] = ( ...args ) => {
          /*console.warn(name);
          console.dir(module)*/
          if(!module || !module[name]){
            debugger
          }

          return module[ name ]( ...args );
        };
        this[ name ].module = module
      } );
    }

  },
  getModule: function(name) {
    return this.modulesHash[name];
  },
  '~destroy': function(cb) {
    Promise.all(this.modules.map(function({module}) {
      return new Promise(function(resolve, reject) {
        if(module['~destroy']){
          module['~destroy'](resolve);
        }else{
          resolve();
        }
      });
    })).then(function() {
      cb && cb();
    })
  }
};
Object.assign(CMS.prototype, Observable.prototype)
CMS.Group = require('api-tapir').Group;
module.exports = CMS;
