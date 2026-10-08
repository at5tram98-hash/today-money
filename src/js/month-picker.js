/* A single draft-and-confirm month wheel for salary and payments. */
function openDisplayMonthPicker({title,value,onApply}){
  const current=ym(),valid=/^\d{4}-(0[1-9]|1[0-2])$/;
  let draft=valid.test(value)?value:current;
  const dates=[current,draft,addMonths(current,-12),addMonths(current,12),...data.salaryRecords.map(x=>x.date),...data.fixedPayments.map(x=>x.date)].filter(x=>valid.test(String(x||'').slice(0,7))).map(x=>Number(x.slice(0,4)));
  const lo=Math.min(...dates),hi=Math.max(...dates),years=Array.from({length:Math.min(hi-lo+1,201)},(_,i)=>lo+i);
  if(!years.includes(Number(draft.slice(0,4))))years.push(Number(draft.slice(0,4)));
  years.sort((a,b)=>a-b);
  const values={year:years,month:Array.from({length:12},(_,i)=>i+1)};
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="monthPickerCancel">キャンセル</button><div class="sheet-title">${esc(title)}</div><button type="button" class="nav-text" id="monthPickerToday">今月</button></div><div class="sheet-body month-picker-body"><p class="month-picker-caption">年と月を選んでから確定してください</p><div class="month-wheel-frame">${Object.entries(values).map(([key,list])=>`<div class="month-wheel" role="listbox" tabindex="0" aria-label="${key==='year'?'年':'月'}" id="monthWheel-${key}">${list.map(v=>`<button type="button" role="option" tabindex="-1" id="month-${key}-${v}" data-value="${v}" aria-selected="false">${v}${key==='year'?'年':'月'}</button>`).join('')}</div>`).join('')}<div class="month-wheel-selection" aria-hidden="true"></div></div><output class="month-picker-result" id="monthPickerResult" aria-live="polite"></output><button type="button" class="primary" id="monthPickerApply">この月を表示</button></div>`,'half',root=>{
    const timers=new Map();let ready=false;
    function paint(){
      root.querySelector('#monthPickerResult').textContent=monthLabel(draft);
      for(const key of Object.keys(values)){
        const selected=Number(draft.slice(key==='year'?0:5,key==='year'?4:7)),wheel=root.querySelector('#monthWheel-'+key);
        wheel.setAttribute('aria-activedescendant',`month-${key}-${selected}`);
        wheel.querySelectorAll('[data-value]').forEach(b=>b.setAttribute('aria-selected',String(Number(b.dataset.value)===selected)));
      }
    }
    function choose(key,v){draft=key==='year'?`${v}-${draft.slice(5)}`:`${draft.slice(0,4)}-${pad(v)}`;paint()}
    function settle(key){const wheel=root.querySelector('#monthWheel-'+key),index=clamp(Math.round(wheel.scrollTop/44),0,values[key].length-1);choose(key,values[key][index])}
    function position(){for(const key of Object.keys(values)){const selected=Number(draft.slice(key==='year'?0:5,key==='year'?4:7));root.querySelector('#monthWheel-'+key).scrollTop=values[key].indexOf(selected)*44}paint()}
    for(const key of Object.keys(values)){
      const wheel=root.querySelector('#monthWheel-'+key);
      wheel.onclick=e=>{const option=e.target.closest('[data-value]');if(!option)return;choose(key,Number(option.dataset.value));wheel.scrollTo({top:values[key].indexOf(Number(option.dataset.value))*44,behavior:'instant'})};
      wheel.onscroll=()=>{if(!ready)return;clearTimeout(timers.get(key));timers.set(key,setTimeout(()=>settle(key),140))};
      wheel.onkeydown=e=>{
        const selected=Number(draft.slice(key==='year'?0:5,key==='year'?4:7)),index=values[key].indexOf(selected);
        const next=({ArrowUp:index-1,ArrowDown:index+1,Home:0,End:values[key].length-1})[e.key];
        if(next==null)return;e.preventDefault();choose(key,values[key][clamp(next,0,values[key].length-1)]);position();
      };
    }
    root.querySelector('#monthPickerCancel').onclick=requestSheetClose;
    root.querySelector('#monthPickerToday').onclick=()=>{draft=current;position()};
    root.querySelector('#monthPickerApply').onclick=()=>{for(const key of Object.keys(values)){clearTimeout(timers.get(key));settle(key)}const selected=draft;closeSheet();void onApply(selected)};
    position();requestAnimationFrame(()=>{position();ready=true});
    return ()=>{timers.forEach(clearTimeout);ready=false};
  });
}
