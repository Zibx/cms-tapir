import Horizontal from "block/Layout/Horizontal/Horizontal.jsx";
import { Checkbox } from "component/Checkbox/Checkbox.jsx";
import Vertical from "block/Layout/Vertical/Vertical.jsx";
import { Slider } from "component/Slider/Slider.jsx";
import { Select } from "component/Select/Select.jsx";
export default function main(input){

  var select, content, properties, currentPage = new Store.Value.Any(null);
  var pages = new Store.Value.Array([]);
  var dom = <Horizontal class={'main-layout-horizontal'}>
    <Vertical class={'left-side'}>
      <div class={'page-selector'}>
        {select = <Select items={pages} value={currentPage}></Select>}
      </div>
      {content = <div class={'content'}></div>}
    </Vertical>
    {properties = <div class={'properties'}></div>}
  </Horizontal>;


  var randomChars = ()=>Math.random().toString(36).substr(2, 12);
  var communicationHash = randomChars()+randomChars();

  window.document.addEventListener('myCustomEvent', handleEvent, false)
  function handleEvent(e) {
    console.log(e.detail) // outputs: {foo: 'bar'}
  }
  var eventHandleFn = function(e) {
    console.log(e.detail)
  };
  currentPage.hook(function(page) {
    if(communicationHash){
      window.document.removeEventListener(communicationHash, eventHandleFn)
    }
    communicationHash = randomChars()+randomChars()

    window.document.addEventListener(communicationHash, eventHandleFn, false)


    var frame = <iframe src={page}></iframe>;
    D.replaceChildren(content, frame );
    frame.addEventListener( "load", function(e) {
      var script = this.contentDocument.createElement('script');
      script.src = '/admin/admin.js?hash='+communicationHash;
      this.contentDocument.head.appendChild(script);
    } );
  }, true)
  
  Ajax.post('/admin/page/list', {page: 'main'}, function(err, data) {
    select.setItems(data.map(item=>({key:item.path, value: item.page})))
  });
  


  return dom;
/*  var val1 = new Store.Value.Boolean(false);

  var x = new Store.Value.Number(44);
  return <Horizontal>
      <b>1</b>
      <b>2</b>
      <Vertical>
        <Checkbox value={true}/>
        <Checkbox value={val1}/>
        <Checkbox value={true}/>
        <Checkbox value={val1}/>
        <Slider from={10} to={100} value={x}/>
      </Vertical>
      <b>4</b>
      <b>5 {T.toFixed(x)}</b>
    </Horizontal>*/
};