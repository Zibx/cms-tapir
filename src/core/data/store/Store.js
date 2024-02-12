/*
Observable Store based in 2016 April by Ivan Kubota
License: MPL 2.0
Contact: zibx@quokka.pub
 */
const isEqual = function(original, fn) {
  return function(val) {
    fn(val===original);
  }
};
const isNotEqual = function(original, fn) {
  return function(val) {
    fn(val!==original);
  }
};
const isContain = function(original, fn) {
  return function(val) {
    fn((val||[]).indexOf(original)>-1);
  }
};

/*
-- DESIGN --
Store MUST notify all subscribers on each change
Store MUST NOT notify subscribers if it does not change

 */
const Store = function(cfg, key) {
    Observable.call(this);
    this.events = new Observable();
    this._props = cfg || {};
    this._key = key;
    // SINGLETONS
    this.arrays = {};
    this.items = new WeakMap();
  },
  isObject = function(obj) {
    // null is not an object. treat Date as primitive
    return typeof obj === 'object' && obj !== null && !(obj instanceof Date);
  };
const recursiveWalk = function(path, pointer, key, list) {
    if(typeof pointer[key] === 'object'){
      for(let subKey in pointer[key]){
        if(typeof pointer[key][subKey] === 'object'){
          list.push( [ path.concat( key, subKey ).join('.'), void 0 ] );
        }
        recursiveWalk(path.concat(key), pointer[key], subKey, list);
      }
    }else{
      list.push( [ path.concat( key ).join('.'), void 0 ] );
    }
  },
  recursiveSet = function(path, pointer, key, val, list){
    let subKey,i, originalLength, originalValue;
    if( isObject(val) ){
      if(Array.isArray(val)){

        if(!Array.isArray(pointer[key])){
          pointer[ key ] = [];
          list.push([path.concat(key).join( '.' ), pointer[ key ]])
        }
        originalLength = pointer[ key ].length;
      }else{
        if(!isObject(pointer[ key ])){
          pointer[ key ] = {};
          list.push([path.concat(key).join( '.' ), pointer[ key ]])
        }
      }

      for(subKey in val){
        recursiveSet( path.concat( key ), pointer[ key ], subKey, val[subKey], list );
      }

      for( subKey in pointer[ key ] ){
        if( !val.hasOwnProperty( subKey ) ){
          // remove
          recursiveWalk( path.concat( key ), pointer[key], subKey, list );
          delete pointer[ key ][ subKey ];
        }
      }
      if(Array.isArray(val)){
        if(originalLength !== val.length){
          recursiveSet( path.concat( key ), pointer[ key ], 'length', val.length, list );
          list.push([path.concat(key).join( '.' ), pointer[ key ]]);
        }
      }
    }else{
      originalValue = pointer[ key ];
      if( val !== originalValue ){
        pointer[ key ] = val;
        list.push( [ path.concat(key).join( '.' ), pointer[ key ] ] );
      }

    }
  };
var StoreParent = function(parent, key, item) {
  this.parent = parent;
  this.key = key;
  this.item = item;
};
StoreParent.prototype = {
  getKey: function() {
    if(this.key !== null && this.key !== void 0){
      return this.key;
    }else{
      var idx = this.parent._props.indexOf(this.item);
      if(idx > -1)
        return idx;
      console.error('try to write to not existed item');
    }
  },
  getPointer: function() {
    return this.parent.get(this.getKey());
  }
};
Store.prototype = {
  _key: null,
  parent: null,
  setParent: function(parent, key, item){
    this.parent = new StoreParent(parent, key, item);
  },
  bindings: function() {
    var _self = this;
    var out = {
      _addOther: function(obj){
        for(var key in obj)
          if(_self.get(key) === void 0){
            _self.set( key, obj[key] );
            this[key] = _self.bind(key);
          }
        return this;
      }
    };
    for(var k in this._props){
      out[k] = this.bind(k);
    }
    return out;
  },
  item: function(key, refItem) {
    var item = refItem ? refItem : this.get(key);
    var subStore = typeof item === 'object' ? this.items.get(item) : void 0;
    if(subStore === void 0){
      this.items.set(item, subStore = new Store(null, key));
      subStore.setParent(this, key, item);
    }
    return subStore;
  },

  // TODO: TEST item in real project and remove this
  item2: function(key, item){

    let subStore = item ? new Store(item) : new Store(null, key);
    subStore.setParent(this, key, item);
    return subStore;
  },
  array: function(key){
    // singletons
    if(key in this.arrays)
      return this.arrays[key];
    let arrayStore = new ArrayStore(this.get(key));
    arrayStore.setParent(this, key);
    return this.arrays[key] = arrayStore;
  },
  experimental: false,
  _set: function(keys, val, pointer, changeList) {
    changeList = changeList || [];
    let parent, i, _i;
    for(i=0, _i = keys.length - 1; i < _i; i++){
      let key = keys[i];
      parent = pointer;

      if(key in pointer){
        pointer = parent[key];
        if(!isObject(pointer)){
          pointer = parent[key] = {};
          changeList.push([keys.slice(0, i).join( '.' ), parent[key]]);
        }
      }else{
        pointer = parent[key] = {};
        changeList.push([keys.slice(0, i+1).join( '.' ), parent[key]]);
      }

    }

    let key = keys[i];
    recursiveSet(keys.slice(0, keys.length - 1), pointer, key, val, changeList);
  },
  clear: function() {
    this._props = {};
    this.events.fire('change', null, null);
  },
  /*
  key: String, val: any
  key: {k: v, ...}
   */
  set: function(key, val, changeList, bubbleState) {
    var isChangeList = changeList !== void 0;
    if(!changeList){
      bubbleState = true;
      changeList = [];
    }

    var type = typeof key;

    if(bubbleState && this.parent){
      var parentKey = this.parent.getKey();
      if(type === 'object'){
        Store.prototype.set.call( this.parent.parent,
          parentKey,
          key
        );
      }else{
        Store.prototype.set.call( this.parent.parent,
          parentKey + '.' + key,
          val
        );
      }
      return this;
    }else{
      bubbleState = false
    }
    if(type === 'object'){
      for(let k in key){
        this.set(k, key[k], changeList, bubbleState);
      }
      this._notify(changeList);
      return this;
    }



    var _key = key;
    if(type === 'string') {
      _key = key.split('.');
    }else if(type === 'number'){
      _key = [key];
    }

    this._set(
      _key,
      val,
      this._props,
      changeList
    );

    if(!isChangeList)
      this._notify(changeList);




    return this;
  },
  reSet: function(key, val, changeList) {
    this._props = {};
    if(key===void 0)
      return this;
    return this.set(key, val, changeList);
  },
  _notifyBubble: function(changeListBubbled, prefix, additional){
    prefix = prefix || '';


    var item, changeList = [], list = [], i, key;
    for( i = changeListBubbled.length; i;){
      item = changeListBubbled[--i];
      list.push(item);
      key = list.join('.');
      changeList.push([key, this.get(key)]);
    }

    if(this.parent){
      changeListBubbled.push(this.parent.getKey());
      if(prefix) {
        this.parent.parent._notifyBubble(changeListBubbled, this.parent.getKey() + '.' + prefix, additional);
      }else{
        this.parent.parent._notifyBubble(changeListBubbled, this.parent.getKey(), additional);
      }
    }else{
      this._notify(changeList, '', additional)
    }

    //debugger

  },
  _notifyDeep: function(evt, fullKey, val, additional) {
    this.events.fire(evt, fullKey, val, additional);
    this.fire(fullKey, val, additional);
    var tokens = fullKey.split('.');
    if(tokens.length>1){
      if(tokens[0] in this.arrays){
        this.arrays[tokens[0]]._notifyDeep(evt,tokens.slice(1).join('.'), val, additional);
      }else if(this.items.has(this._props[tokens[0]])){
        this.items.get(this._props[tokens[0]])._notifyDeep(evt,tokens.slice(1).join('.'), val, additional);
      }
    }
  },
  _notify: function(changeList, prefix, additional) {
    prefix = prefix === void 0 ? '' : prefix;
    for( let i = changeList.length; i; ){
      const changeListElement = changeList[ --i ];
      var key = changeListElement[0], val = changeListElement[1],
        fullKey = prefix+(key===''?'':(prefix===''?'':'.')+key);
      this._notifyDeep('change', fullKey, changeListElement[1], additional)


    }
    if(this.parent){
      if(prefix) {
        this.parent.parent._notify(changeList, this.parent.getKey() + '.' + prefix, additional);
      }else{
        this.parent.parent._notify(changeList, this.parent.getKey(), additional);
      }
    }
  },
  get: function(key, returnLastStore) {

    if(key === void 0){
      if(this.parent)
        return this.parent.parent.get(this.parent.getKey())

      return this._props;
    }

    let type = typeof key;
    if(type === 'string') {
      key = key.split('.');
    }
    if(type === 'number') {
      key = [key];
    }

    let ref = this.parent ? this.parent.getPointer() : this,
      lastStore = ref, i, _i;

    for( i = 0, _i = key.length; i < _i; i++ ){
      if( ref instanceof Store ){
        ref = ref._props[key[i]];
        lastStore = ref;
      }else{
        ref = ref[key[i]];
      }

      if( !ref && i < key.length - 1 )
        return void 0;
    }

    if( returnLastStore )
      return { lastQObject: lastStore, result: ref };

    return ref;
  },

  sub: function(key, fn, suppressFirstCall) {
    var un;
    if(Array.isArray(key)){
      var _self = this;

      var args = new Array(key.length);

      var caller = function() {
        return fn.apply(_self, args);
      };
      var wrap = function(i){
        return function(val, force) {
          if(args[i] !== val || force){
            args[ i ] = val;
            return caller();
          }
        };
      };

      var uns = [], keyI;

      for( var i = 0, _i = key.length; i < _i; i++ ){
        keyI = key[i];
        if(keyI instanceof StoreBinding){
          args[i] = keyI.get();
        }else if(keyI instanceof HookPrototype){
          args[i] = keyI.get();
        }else{
          args[i] = this.get(keyI);
        }
      }
      for( i = 0; i < _i; i++ ){
        keyI = key[i];
        if(keyI instanceof StoreBinding){
          // TODO add suppressFirstCall
          uns.push(keyI.sub(wrap(i)));
        }else if(keyI instanceof HookPrototype){
          uns.push(keyI.hook(wrap(i), suppressFirstCall));
        }else{
          uns.push(this.on( keyI, wrap(i) ));
        }
      }

      !suppressFirstCall && caller();
      return function() {
        for( var i = 0, _i = uns.length; i < _i; i++ ){
          uns[ i ]();
        }
      };
    }else{
      un = this.on( key, fn );
      !suppressFirstCall && fn( this.get( key ) );
      return un;
    }

  },
  equal: function(key, val, fn) {
    const wrap = isEqual(val, fn);
    this.on(key, wrap);
    wrap(this.get(key));
    return this;
  },
  notEqual: function(key, val, fn) {
    const wrap = isNotEqual(val, fn);
    this.on(key, wrap);
    wrap(this.get(key));
    return this;
  },
  contain: function(key, val, fn) {
    const wrap = isContain(val, fn);
    this.on(key, wrap);
    wrap(this.get(key));
    return this;
  },
  bind: function (key) {
    return Array.isArray(this._props[key]) ? this.array(key): new StoreBinding( this, key );
  },
  val: function(key) {
    const me = this;
    return function backwardCallback(update) {
      me.sub(key, val => update(val));
    }
  },
  valEqual: function(key, val) {
    const me = this;
    return function backwardCallback(update) {
      me.equal(key, val, compareResult => {update(compareResult)});
    }
  },
  valNotEqual: function(key, val) {
    const me = this;
    return function backwardCallback(update) {
      me.notEqual(key, val, compareResult => {update(compareResult)});
    }
  },
  valEqualOnly: function(key, val) {
    const me = this;
    return function backwardCallback(update) {
      me.equal(key, val, compareResult => {compareResult && update(compareResult)});
    }
  },
  valContains: function(key, val) {
    const me = this;
    return function backwardCallback(update) {
      me.contain(key, val, compareResult => {compareResult && update(compareResult)});
    }
  },
  valTrue: function(key) {
    return this.valEqual(key, true);
  },
  valFalse: function(key) {
    return this.valEqual(key, false);
  },
  sync: function(key, version, saveInterface) {
    saveInterface = saveInterface || Store.SaveInterface.LocalStorage;
    var iface = new saveInterface(key, this), _self = this;

    this._props._VERSION_ = version;
    iface.load(function(err, data) {
      if(err)
        return;

      if(data._VERSION_ >= version){
        if( !( '_VERSION_' in data ) || data._VERSION_ === version ){
          for( var k in data ){
            _self.set( k, data[ k ] );
          }
        }
      }else{
        iface.save();
      }
    });

    var shouldSave,
      saveFn = function() {
        iface.save();
        clearTimeout(shouldSave)
        shouldSave = false;
      };
    this.events.on('change', function() {
      if(!shouldSave)
        shouldSave = setTimeout(saveFn, 500);
    });
    this.save = saveFn;
  }
};
Store.SaveInterface = {};
// interface for save and load data
Store.SaveInterface.LocalStorage = function(key, store) {
  this.key = key;
  this.store = store;
};
Store.SaveInterface.LocalStorage.prototype = {
  load: function(cb) {
    var data;
    try{
      data = JSON.parse( localStorage.getItem( this.key ) );
    }catch(e){}
    cb && cb(false, data || {});
    return data;
  },
  // Should support full save if arguments.length === 0
  save: function(key, val) {
    localStorage.setItem(this.key, JSON.stringify(this.store._props));
  }
};

const StoreBinding = function(store, key){
  this.store = store;
  this.key = key;
};
StoreBinding.prototype = {
  sub: function (k, fn) {
    if(typeof k === 'function'){
      fn = k;
      return this.un = this.store.sub(this.key, fn);
    }else{
      return this.un = this.store.sub(
        (Array.isArray(k)?k:[k]).map(k=> k instanceof StoreBinding ? k : this.key+'.'+k), fn);
    }

  },
  set: function (val) {
    this.store.set(this.key, val);
  },
  get: function() {
    return this.store.get(this.key);
  },
  bind: function(key) {
    return new StoreBinding(this.store, this.key+'.'+key);
  },
  hook: function(draw) {
    return this.sub(function(val){
      draw(val);
    });
  },
  array: function() {
    return this.store.array(this.key);
  }
};
Store.prototype = Object.assign(new Observable, Store.prototype);

Store.StoreBinding = StoreBinding;

Store.AGGREGATE = function(fn) {
  return function(...args) {
    let composite, _i = args.length,
      vals = new Array(_i);
    return function(update) {
      let check = ()=>{
        let result = fn(vals, _i);

        if(composite !== result)
          update(composite = result);
      };
      for(let i = 0; i < _i; i++){
        // set backward callback
        let hook = val => {
          // update item corresponding value and check condition
          vals[ i ] = val;
          check();
        };
        if(args[i] instanceof HookPrototype){
          args[i].hook(hook)
        }else{
          args[ i ]( hook )
        }
      }

    };

  };
};

Store.AND = Store.AGGREGATE(function(values, length) {
  let result = true;
  for(let i = 0; i < length; i++){
    result = result && values[i];
  }
  return result;
});

Store.OR = Store.AGGREGATE(function(values, length) {
  let result = false;
  for(let i = 0; i < length; i++){
    result = result || values[i];
  }
  return result;
});
Store.ELSE = function(){if(!( this instanceof Store.ELSE))return new Store.ELSE()};
Store.IF = function(cfg, children){
  var holders = {true: [], false: []},
    holder = holders.true;
  for( var i = 0, _i = children.length; i < _i; i++ ){
    var child = children[ i ];
    if(child instanceof Store.ELSE){
      holder = holders.false;
    }else{
      holder.push(child);
    }
  }
  holders.true.length === 0 && (holders.true = null);
  holders.false.length === 0 && (holders.false = null);

  return function( update ){
    if( 'condition' in cfg )
      var hook = function( cond ){
        update( cond ? holders.true : holders.false );
      };
    if(cfg.condition instanceof HookPrototype){
      cfg.condition.hook( hook );
    }else if(typeof cfg.condition === 'function'){
      cfg.condition( hook );
    }else if(typeof condition !== 'object'){
      console.warn('Condition is not reactive');
      update(!!condition);
    }else{
      // TODO other hooklikes
      hook(cfg.condition)
    }
  }
};
Store.NOT = Store.AGGREGATE(function(values, length) {
  return !values[0];
});

/** @function Store.debounce
 * @param {function} fn - function that would be called
 * @param {number} dt - delay before call
 * @param {boolean} [strictDelay = false] - delay would be
 * @description prevent multiple function calls
 * @returns {function}
 * */
Store.debounce = function(fn, dt, strictDelay) {
  var timeout = false, args, scope, lastCall,
    realCall = function() {
      if(strictDelay){
        var now = +new Date();
        if(lastCall>=now-dt ){
          return timeout = setTimeout(realCall, lastCall+dt-now+1);
        }

      }
      timeout = false;
      fn.apply(scope, args)
    };
  return function(){
    lastCall = +new Date();
    args = [].slice.call(arguments);
    scope = this;
    if(!timeout){
      timeout = setTimeout(realCall, dt);
    }
  }
};
var HookPrototype = function() {};
HookPrototype.prototype = {
  setter: function(val) { return val; },
  //getter: function(val) { return val; },
  set: function(val) {
    val = this.setter(val);
    var oldVal = this.get();
    if(!this.equal(oldVal, val)){
      this._props = val;
      this._emit(oldVal, val);
    }
  },
  equal: function(oldVal, newVal){
    return newVal === oldVal;
  },
  get: function() {
    return this._props;
  },
  binding: function() {
    var x = new StoreBinding();
    x.get = ()=> this.get();
    x.set = (a)=> this.set(a);
    x.sub = (fn)=> this.hook(fn);
    return x;
  },
  hook: function(fn, suppressFirstCall) {
    this.subscribers.push(fn);
    !suppressFirstCall && fn(this.get());
    var _self = this;
    return function() {
      var index = _self.subscribers.indexOf(fn);
      if(index>-1){
        _self.subscribers.splice( index, 1 );
      }
    }
  },
  _emit: function(oldVal, val) {
    var subscribers = this.subscribers;
    for( var i = 0, _i = subscribers.length; i < _i; i++ ){
      subscribers[ i ](val);
    }
  },
  valEqual: function(compareTo) {
    var me = this;
    return function backwardCallback(update) {
      var cache;
      me.hook(function(val) {
        var result = me.equal(val, compareTo);
        if(result !== cache){
          cache = result;
          update(cache);
        }
      });
    }
  }
};
var HookFactory = function(accessor, baseObjectCtor) {
  var Hook = function(cfg) {
    if(!(this instanceof Hook))
      return new Hook(cfg);
    this._props = baseObjectCtor ? baseObjectCtor(this, cfg) : {};
    this.subscribers = [];
    this.set(cfg);
  };
  Hook.prototype = Object.assign( new HookPrototype(), accessor );

  return Hook;
};

Store.getValue = function(val) {
  if(val instanceof StoreBinding){
    return val.hook();
  }else{
    return val;
  }
};


Store.HookPrototype = HookPrototype;

/*
-- DESIGN --
Array DOES NOT notify the store when it's item changes
Array MUST notify itself when item is added or removed
Array MUST notify when it is reordered
Array Item MUST be observed itself
 */

var getter = function( i ){ return this[i]; };
var fns = Array.prototype;

const ArrayStore = function(cfg) {
  Store.call(this, cfg);
  this._exposeGet();
  this.length = this._props.length;
};

ArrayStore.prototype = {
  _index: false,
  _exposeGet: function() {
    if( !('get' in this._props) ){
      Object.defineProperties( this._props, {
        get: { value: getter, enumerable: false }
      } );
    }
    return this._props;
  },
  length: 0,
  indexOf: function (a) {
    if(typeof a === 'function'){
      for( var i = 0, _i = this._props.length; i < _i; i++ ){
        if(a(this._props[ i ]))
          break;
      }
      return i < _i ? i : -1;
    }else{
      return this._props.indexOf( a );
    }
  },
  toArray: function () {
    return this._props;
  },
  _fireAdd: function (item, pos) {
    this._index && this._addToIndex(item);
    var arr = this._props;
    this.fire('add', item, pos > 0 ? arr.get(pos-1) : null, pos < this.length - 1 ? arr.get(pos+1) : null, pos)
    this._notifyBubble([pos], '', true);
  },
  _fireRemove: function (item, pos) {
    this._index && this._removeFromIndex(item);
    var arr = this._props;
    this.fire('remove', item, pos > 0 ? arr.get(pos-1) : null, pos < this.length ? arr.get(pos) : null, pos)
    this._notifyBubble([], '', true);
  },
  push: function (item) {
    // single item push only
    var out = this._props.push(item);
    this._fireAdd(item, this.length++);
    return out;
  },
  unshift: function (item) {
    // single item unshift only
    var out = this._props.unshift(item);
    this.length++;
    this._fireAdd(item, 0);
    return out;
  },
  shift: function(){
    var pos = --this.length,
      arr = this._props,
      item = arr.shift();

    this._fireRemove(item, 0);
    return item;
  },
  pop: function () {
    var pos = --this.length,
      arr = this._props,
      item = arr.pop();

    this._fireRemove(item, pos);
    return item;
  },
  splice: function(start, count){
    var i, _i, newItems = fns.slice.call(arguments,2 ), out = [];
    for(i = 0;i<count; i++)
      out.push(this.remove(start));

    for(i = 0, _i = newItems.length; i < _i; i++)
      this.insert(newItems[i], i + start);

    return out;
  },
  /*
  set - updates element
  @arg pos: position of element. defined on [0..length]
  @arg item: element to set

  @return element that was in that position before
   */
  set: function(key, item){
    var _key = key, type = typeof key;
    if(type === 'string') {
      _key = key.split('.');
    }else if(type === 'number'){
      _key = [key];
    }

    //if(_key.length === 1){
    if( Array.isArray( key ) && arguments.length === 1 ){
      this.splice.apply( this, [ 0, this.length ].concat( key ) )
      return this;
    }else if( key === this.length ){
      this.push( item );
      return void 0; // for same behavior we return empty array
    }
    return this.splice( key, 1, item )[ 0 ];
    /*}else{
      return this.item(_key[0]).set(_key.slice(1), item);
    }*/
  },
  iterator: function(start){
    return new Iterator(this, start);
  },
  removeItem: function(item){
    var index = this._props.indexOf(item);
    if(index > -1){
      this.remove(index);
    }
    return item;
  },
  remove: function(pos){
    var item = this._props.splice(pos,1)[0];
    this.length--;
    this._fireRemove(item, pos);
    return item;
  },
  insert: function(item, pos){

    this._props.splice(pos, 0, item);
    this.length++;
    this._fireAdd(item, pos)
  },
  forEach: function (fn) {
    return this._props.forEach(fn);
  },
  map: function (fn) {
    return this._props.map(fn);
  },
  filter: function(fn) {
    return this._props.filter(fn);
  },
  index: function(cfg){
    this._index = true;
    this._indexes = this._indexes || {};
    var _self = this;
    for(var key in cfg){
      this._indexes[key] = {cfg: cfg, data: {}};
    }

    this._props.forEach(function(item){
      _self._addToIndex(item, true);
    });
    return this;
  },
  _addToIndex: function(item, suppressErrors){
    var _indexes = this._indexes
    for(var key in _indexes){
      var data = _indexes[key].data;
      (data[item[key]] || (data[item[key]] = [])).push(item);
    }
  },
  _removeFromIndex: function(item){
    for(var key in this._indexes){
      var index = this._indexes[key];
      var keyValue = item[key];
      var arr = index.data[keyValue];
      for(var i = arr.length; i >= 0; i--){
        if(arr[i] === item){
          arr.splice(i, 1);
        }
      }
      if(arr.length === 0){
        delete index.data[keyValue];
      }
    }
  },
  find: function(cfg){
    var dataToFilter;
    dataToFilter = this._props;

    if(!this._index){
      noUnindexed = false;
    }else{
      var indexed = [], unindexed = {}, noUnindexed = true;
      for(var key in cfg){
        if(key in this._indexes){
          indexed.push({key: key, val: cfg[key]});
        }else{
          unindexed[key] = cfg[key];
          noUnindexed = false
        }
      }
      cfg = unindexed;
      for(var i = 0, _i = indexed.length; i < _i; i++){
        indexed[i] = indexed[i].key in this._indexes ? this._indexes[indexed[i].key].data[indexed[i].val] : []
      }

      if(indexed.length) {
        if(indexed.length === 1){
          dataToFilter = indexed[0]
        }else{
          // reduce intersection of matched indexes
          indexed.sort(function(a,b){
            return a.length - b.length;
          });
          var a = new Set(indexed[0]);
          var b = new Set(), tmp;
          for(var i = 1, _i = indexed.length; i < _i; i++){
            var other = indexed[i];
            b.clear();
            for(var j = 1, _j = other.length; j < _j; j++){
              var item = other[j];
              a.has(item) && b.add(item);
            }
            tmp = a;
            a = b;
            b = tmp;
          }
          dataToFilter = Array.from(a);
        }
      }
    }

    // SLOW STRAIGHTFORWARD IMPLEMENTATION
    return noUnindexed ? dataToFilter : dataToFilter.filter(function(obj){
      var suit = true;
      for(var key in cfg){
        if(typeof cfg[key] !== 'function') {
          suit = suit && obj[ key ] === cfg[ key ];
        }else {
          suit = suit && cfg[ key ].call( obj, obj[ key ] )
        }

        if(!suit) {
          return false;
        }
      }
      return suit;
    });

  },
  items: function() {
    //return this.item()
  },
  sub: function(fn, suppressFirstCall) {
    var changed = () => {
      fn.call(this, this._props);
    }
    this.on('add', changed);
    this.on('remove', changed);
    !suppressFirstCall && changed();
  }
};
ArrayStore.prototype = Object.assign(new Store(), ArrayStore.prototype);
ArrayStore.UNIQUE = 'UNIQUE';

Store.ArrayStore = ArrayStore;

// Object.assign does not work with nested prototypes
ArrayStore.linearPrototype = {};
for(var i in ArrayStore.prototype){
  ArrayStore.linearPrototype[ i ] = ArrayStore.prototype[ i ];
}

Store.Value = {
  Boolean: new HookFactory({
    setter: function(val) { return !!val; },
    toggle: function() { this.set(!this.get()); }
  }),
  Number: new HookFactory({
    setter: function(val) { return val-0; }
  }),
  String: new HookFactory({
    setter: function(val) { return val+''; }
  }),
  Integer: new HookFactory({
    setter: function(val) { return val|0; }
  }),
  Any: new HookFactory(),
  Array: new HookFactory(ArrayStore.linearPrototype, function(obj){obj._listeners = {}; return obj._exposeGet.call({_props: []}); }),
  Function: new HookFactory()
};



typeof module === 'object' && (module.exports = Store);
(typeof window === 'object') && (window.Store = Store);