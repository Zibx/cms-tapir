
const assert = require('chai').assert;
describe('file manipulations', function() {
	it('should be able to change file ext', function() {
		var Dir = require('../dir.js');
		var d = new Dir('base', 'd1'),
			f = d.file('mr/f1.jsx');
		var x = f.path.split(/[\\/]/g).join('/');
		assert.equal(x, 'base/d1/mr/f1.jsx');

		var f2 = f.clone();
		x = f2.path.split(/[\\/]/g).join('/');
		assert.equal(x, 'base/d1/mr/f1.jsx');

		f2 = f.clone();
		f2.ext = 'jsx.map'
		x = f2.path.split(/[\\/]/g).join('/');
		assert.equal(x, 'base/d1/mr/f1.jsx.map');

		f2 = f.clone();
		f2.ext = '.jsx.map'
		x = f2.path.split(/[\\/]/g).join('/');
		assert.equal(x, 'base/d1/mr/f1.jsx.map');

	});
});
var port = 500+(Math.random()*3|0)*100;
var createTapir = function(done) {
	var tapir = require('../');
	var t = new tapir({
		config: {
			base: __dirname,
			port: 8000+(++port),
			static: ['static'],
			template: ['template'],
			/*scss: {
				shared: '/src/shared.scss'
			}*/
		},
		routes: {
			'/': {page: 'main'}
		},
		base: __dirname
	});
	setTimeout(function() {
		t['~destroy'](done);
	}, 500);
	return t;
};

describe('basic tapir', function(){
	it( 'should resolve modules', function(done){
		var t = createTapir(done);

		t.serve('/block/block.jsx', function(err, result) {
			assert.equal(err, false);
			assert.equal(result.code.indexOf('D.h("div", null, "a"')>-1, true);
			assert.equal(result.code.indexOf('"./block2.jsx"')>-1, true);
		});
		assert.equal(1,1);
	} );

	it( 'should fail resolve unexisted modules', function(done){
		var t = createTapir(done);

		t.serve('/block/block_error.jsx', function(err, result) {
			assert.equal(err, true);
		});
		assert.equal(1,1);
	} );

	it( 'should import svg', function(done){
		var t = createTapir(done);

		t.serve('/block/block_import_svg.jsx', function(err, result) {
			assert.equal(err, false);
			assert.equal(result.code.indexOf('D.h("div", null, "image: "')>-1, true);
			assert.equal(result.code.indexOf('"./svg.svg"')>-1, true);
		});
		assert.equal(1,1);
	} );

	it( 'should import scss', function(done){
		var t = createTapir(done);

		t.serve('/block/block_import_scss.jsx', function(err, result) {
			console.log(result.code)
			assert.equal(err, false);
		});
		assert.equal(1,1);
	} );

  it( 'should serve jsx without extension', function(done){
    var t = createTapir(done);

    t.serve('/block/block3.jsx', function(err, result) {
      assert.equal(err, false);
      assert.equal(result.code.indexOf('D.h("div", null, "a"')>-1, true);
      assert.equal(result.code.indexOf('"./block4.jsx"')>-1, true);
    });
    assert.equal(1,1);
  } );

	it( 'should serve scss', function(done){
		var t = createTapir(done);

		t.serve('/block/scss.scss', function(err, result) {
			console.log(result.code)
			assert.equal(err, false);
			debugger
		});
		assert.equal(1,1);
	} );

	it( 'should serve svg', function(done){
		var t = createTapir(done);

		t.serve('/block/svg.svg', function(err, result) {
			console.log(result.code)
			assert.equal(err, false);
			assert.equal(result.code.indexOf('fill: "#A6A6A6"')>-1, true);
		});
		assert.equal(1,1);
	} );
});
