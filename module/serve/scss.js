const sass = require('node-sass'),
      fileReader = require('../../src/fileReader.js'),
      env = process.env,
      path = require('path'),

      useSourceMaps = env.ENV === 'DEVELOP';

let cache = {};
module.exports = {
  setCache: function(theCache, useCache) {

    cache = theCache;
  },
  response: function(req, res) {
    res.set( 'SourceMap', req.url + '.map' );
    res.set( 'Content-type', 'text/css; charset=UTF-8' );

    /*if(result.error){
      res.end( result.data );
    }else{

      res.end( result.data )
    }*/
  },
  serve: async function(file, code, config) {
    var dependency;

    if(!code){
      dependency = new fileReader.Dependency();
      code = await dependency.read(file);
    }else{
      dependency = new fileReader.Dependency(file);
    }
    var result = await dependency.result(async function(){
      return await (new Promise( function( resolve, reject ){

        if( config.scss && config.scss.shared ){
          code = `@import '${config.scss.shared}';` + ';\n' + code;
        }
        sass.render( {
          data: code,
          file: file.subPath,//path.join( __dirname, dir, req.url ),
          sourceMap: useSourceMaps,
          importer: function( url, prev, done ){ //file, prev, done
            ;(async function(){

              var dependencyFile = await util.path.resolve( url, file, config.template.slice().concat( config.static ) );

              if( dependencyFile ){
                var fileData = await dependency.read( dependencyFile );
                done( {
                  contents: fileData,
                  file: dependencyFile.subPath
                } );
              }else{
                console.error(`ERROR SCSS: can not resolve ${url} from ${file.path}!`)
                done( new Error( `Can not resolve dependency ${url} for ${prev}!` ) );
              }
            })();
          }
        }, function( err, result ){
          if( err ){

            const errorText = `Error at ${err.file}:\n` + err.formatted;
            return resolve({error: true, data: errorText});
          }
          resolve({error: false, data: {code: result.css.toString('utf-8'), map: result.map}});
        } );
      }));
    });
    return result;
  }
}
