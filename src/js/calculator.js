/* Amount input: existing arithmetic and commit callback are retained. */
let calcValue='0',calcCb=null,calcStored=null,calcOp=null,calcWaiting=false,calcLastOperand=null,calcReplaceOnNextDigit=false,calcAllowNegative=false;
function openCalculator(title='金額',initial=0,cb,options={}){calcValue=String(Math.round(Number(initial)||0));calcStored=null;calcOp=null;calcWaiting=false;calcLastOperand=null;calcReplaceOnNextDigit=true;calcAllowNegative=!!options.allowNegative;calcCb=typeof cb==='function'?value=>{cb(value);if(document.getElementById('sheet').classList.contains('show')&&value!==Math.round(Number(initial)||0))markSheetDirty()}:null;document.activeElement?.blur?.();document.getElementById('dim').classList.add('native-calc-dim');document.getElementById('calcTitle').textContent=title;closeCalcTools();updateCalc();document.getElementById('dim').classList.add('show');document.getElementById('calculator').classList.add('show')}
function closeCalc(){closeCalcTools();document.getElementById('dim').classList.remove('native-calc-dim');document.getElementById('calculator').classList.remove('show');if(!document.getElementById('sheet').classList.contains('show'))document.getElementById('dim').classList.remove('show');calcCb=null;calcStored=null;calcOp=null;calcWaiting=false;calcLastOperand=null;calcReplaceOnNextDigit=false;calcAllowNegative=false;updateCalc()}
function calcCompute(a,b,op){a=Number(a)||0;b=Number(b)||0;if(op==='+')return a+b;if(op==='-')return a-b;if(op==='*')return a*b;if(op==='/')return b===0?null:a/b;return b}
function calcFinalValue(){let v=Number(calcValue)||0;if(calcOp&&calcStored!=null&&!calcWaiting){const result=calcCompute(calcStored,v,calcOp);if(result==null)return null;v=result}v=Math.round(v);if(!calcAllowNegative)v=Math.max(0,v);return Math.max(calcAllowNegative?-999999999:0,Math.min(999999999,v))}
function updateCalc(){
  const n=Number(calcValue||0);
  document.getElementById('calcNumber').textContent=Number.isFinite(n)?Math.round(n).toLocaleString('ja-JP'):'0';
  const symbols={'+':'＋','-':'−','*':'×','/':'÷'};
  document.getElementById('calcExpression').textContent=calcOp&&calcStored!=null?`${Math.round(calcStored).toLocaleString('ja-JP')} ${symbols[calcOp]} ${calcWaiting?'':Math.round(n).toLocaleString('ja-JP')}`:'金額を入力';
  document.querySelectorAll('#calcGrid .calc-key.op').forEach(b=>b.classList.toggle('active',!!calcOp&&b.dataset.k===`op:${calcOp}`));
}
function calcKey(k){if(/^[0-9]+$/.test(k)){if(calcWaiting||calcReplaceOnNextDigit){calcValue=k;calcWaiting=false;calcReplaceOnNextDigit=false}else{const neg=calcValue.startsWith('-'),raw=neg?calcValue.slice(1):calcValue;let next=raw==='0'?k:raw+k;if(next.length>9)next=next.slice(0,9);calcValue=(neg?'-':'')+next}updateCalc();return}if(k==='00'){if(calcWaiting||calcReplaceOnNextDigit){calcValue='0';calcWaiting=false;calcReplaceOnNextDigit=false}else if(calcValue!=='0'&&calcValue!=='-0'){const neg=calcValue.startsWith('-'),raw=(neg?calcValue.slice(1):calcValue);calcValue=(neg?'-':'')+(raw+'00').slice(0,9)}updateCalc();return}if(k==='back'){if(calcWaiting||calcReplaceOnNextDigit)return;const neg=calcValue.startsWith('-'),raw=neg?calcValue.slice(1):calcValue;const next=raw.length>1?raw.slice(0,-1):'0';calcValue=(neg&&next!=='0'?'-':'')+next;updateCalc();return}if(k==='clear'){calcValue='0';calcStored=null;calcOp=null;calcWaiting=false;calcLastOperand=null;calcReplaceOnNextDigit=false;updateCalc();return}if(k==='sign'){if(!calcAllowNegative){showToast('この入力ではマイナス金額を使用できません',{tone:'error'});return}if(calcValue!=='0')calcValue=calcValue.startsWith('-')?calcValue.slice(1):'-'+calcValue;calcReplaceOnNextDigit=false;updateCalc();return}if(k==='percent'){calcValue=String(Math.round((Number(calcValue)||0)/100));calcReplaceOnNextDigit=false;updateCalc();return}if(k.startsWith('op:')){const nextOp=k.slice(3),input=Number(calcValue)||0;if(calcOp&&calcStored!=null&&!calcWaiting){const result=calcCompute(calcStored,input,calcOp);if(result==null){showToast('0では割れません',{tone:'error'});return}calcStored=result;calcValue=String(Math.round(calcStored))}else calcStored=input;calcOp=nextOp;calcWaiting=true;calcReplaceOnNextDigit=false;calcLastOperand=null;updateCalc();return}if(k==='done'){if(calcOp&&calcStored!=null){const operand=calcWaiting?(calcLastOperand??(Number(calcValue)||0)):(Number(calcValue)||0),result=calcCompute(calcStored,operand,calcOp);if(result==null){showToast('0では割れません',{tone:'error'});return}calcLastOperand=operand;calcValue=String(Math.round(result));calcStored=Number(calcValue)||0;calcWaiting=true;calcReplaceOnNextDigit=false;updateCalc()}return}}
const calcKeys=[['AC','clear','util'],['%','percent','util'],['⌫','back','util'],['÷','op:/','op'],['7','7',''],['8','8',''],['9','9',''],['×','op:*','op'],['4','4',''],['5','5',''],['6','6',''],['−','op:-','op'],['1','1',''],['2','2',''],['3','3',''],['＋','op:+','op'],['0','0',''],['00','00',''],['000','000',''],['＝','done','op']];
document.getElementById('calcGrid').innerHTML=calcKeys.map(([l,k,c])=>`<button type="button" class="calc-key ${c}" data-k="${k}" aria-label="${l}">${l}</button>`).join('');
document.getElementById('calcGrid').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;calcKey(b.dataset.k)};
document.getElementById('calcCancel').onclick=closeCalc;document.getElementById('calcDone').onclick=()=>{const cb=calcCb,v=calcFinalValue();if(v==null){showToast('計算式を確認してください',{tone:'error'});return}const sheetOpen=document.getElementById('sheet').classList.contains('show');closeCalc();if(sheetOpen)markSheetDirty();cb?.(v)};

function calcAssistResult(base,kind,value){
  if(!Number.isFinite(base)||!Number.isFinite(value)||base<0)return null;
  if(kind==='split'){
    if(!Number.isInteger(value)||value<2||value>100)return null;
    const amount=Math.ceil(base/value),last=base-amount*(value-1);
    // Small totals are divided exactly: remainder people pay one yen more.
    return {amount:Math.floor(base/value),copy:`${Math.floor(base/value).toLocaleString('ja-JP')}円 × ${value-base%value}人${base%value?`、${Math.floor(base/value)+1}円 × ${base%value}人`:''}（合計${base.toLocaleString('ja-JP')}円）`,upper:amount,last};
  }
  if(value<0||value>100)return null;
  return {amount:Math.round(base*(kind==='discount'?1-value/100:1+value/100)),copy:kind==='discount'?`${value}%引き`:`${value}%を加算（1円単位で四捨五入）`};
}
let calcToolBase=0,calcToolKind='discount';
function closeCalcTools(){document.getElementById('calcDone').disabled=false;document.getElementById('calcTools').hidden=true;document.getElementById('calcGrid').hidden=false;document.querySelectorAll('[data-calc-tool]').forEach(b=>b.setAttribute('aria-expanded','false'))}
function renderCalcAssist(){
  const value=(document.getElementById('calcToolValue').value===''?NaN:Number(document.getElementById('calcToolValue').value)),result=calcAssistResult(calcToolBase,calcToolKind,value);
  document.getElementById('calcToolPreview').textContent=result?`${result.amount.toLocaleString('ja-JP')}円`:'入力を確認してください';
  document.getElementById('calcToolNote').textContent=result?result.copy:'割引・加算は0〜100%、割り勘は2〜100人で指定してください。';
  document.getElementById('calcToolApply').disabled=!result||result.amount>999999999;
}
function openCalcAssist(kind){
  const base=calcFinalValue();if(base==null||base<0)return showToast('0円以上の金額を入力してください',{tone:'error'});
  calcToolBase=base;calcToolKind=kind;document.getElementById('calcDone').disabled=true;
  document.getElementById('calcGrid').hidden=true;document.getElementById('calcTools').hidden=false;
  document.querySelectorAll('[data-calc-tool]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.calcTool===kind)));
  document.getElementById('calcToolHeading').textContent={discount:'割引後の金額',add:'割合を加算',split:'割り勘の金額'}[kind];
  document.getElementById('calcToolLabel').textContent=kind==='split'?'人数':'割合（%）';
  const field=document.getElementById('calcToolValue');field.value=kind==='split'?'2':'10';field.min=kind==='split'?'2':'0';field.max='100';field.step=kind==='split'?'1':'0.1';field.inputMode=kind==='split'?'numeric':'decimal';
  document.getElementById('calcToolBase').textContent=`元の金額 ${base.toLocaleString('ja-JP')}円`;renderCalcAssist();
}
document.querySelectorAll('[data-calc-tool]').forEach(b=>b.onclick=()=>openCalcAssist(b.dataset.calcTool));
document.getElementById('calcToolValue').oninput=renderCalcAssist;
document.getElementById('calcToolCancel').onclick=closeCalcTools;
document.getElementById('calcToolApply').onclick=()=>{
  const result=calcAssistResult(calcToolBase,calcToolKind,(document.getElementById('calcToolValue').value===''?NaN:Number(document.getElementById('calcToolValue').value)));if(!result||result.amount>999999999)return;
  calcValue=String(result.amount);calcStored=null;calcOp=null;calcWaiting=false;calcLastOperand=null;calcReplaceOnNextDigit=true;closeCalcTools();updateCalc();
};
document.addEventListener('keydown',e=>{
  if(!document.getElementById('calculator').classList.contains('show')||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||'')||e.ctrlKey||e.metaKey||e.altKey)return;
  const key=/^[0-9]$/.test(e.key)?e.key:({Backspace:'back',Delete:'clear','+':'op:+','-':'op:-','*':'op:*','/':'op:/','%':'percent','=':'done'})[e.key];
  if(key){e.preventDefault();calcKey(key)}else if(e.key==='Enter'){e.preventDefault();document.getElementById('calcDone').click()}
});
