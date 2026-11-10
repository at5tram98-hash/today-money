/* 再構築後のCSSへ、第11版の修正を「そのセレクタの規則そのもの」に反映する（上書き用の規則を足さない）。 */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const repo=process.argv[2],postcss=createRequire(resolve(repo,'package.json'))('postcss'),dir=resolve(repo,'src/css');
const files=Object.fromEntries(readdirSync(dir).filter(f=>f.endsWith('.css')).map(f=>[f,postcss.parse(readFileSync(resolve(dir,f),'utf8'))]));
function set(file,selector,decls){
  let target=null;
  for(const root of Object.values(files))root.each(node=>{if(node.type==='rule'&&node.selectors.includes(selector))target=node});
  if(target&&target.selectors.length>1){const rest=target.selectors.filter(s=>s!==selector),clone=target.clone({selector});target.selector=rest.join(',\n');target.after(clone);target=clone}
  if(!target){target=postcss.rule({selector,raws:{before:'\n',between:' ',semicolon:false,after:' '}});files[file].append(target)}
  for(const [prop,value] of Object.entries(decls)){
    const important=/ !important$/.test(value),v=value.replace(/ !important$/,'');let found=false;
    target.walkDecls(prop,d=>{d.value=v;d.important=important||d.important;found=true});
    if(!found)target.append({prop,value:v,important,raws:{before:target.nodes.length?' ':' ',between:': '}});
  }
}
const edits=[
  // 44×44pt未満だった操作要素
  ['navigation.css','.month-name-btn',{'min-height':'var(--tap-min) !important'}],
  ['layers.css','.push-right>button',{'min-width':'var(--tap-min)','min-height':'var(--tap-min)'}],
  ['payments.css','.mm3-atf-form .mm3-atf-check',{'min-height':'var(--tap-min)'}],
  ['mail.css','#mm3MailHistorySearch',{'min-height':'var(--tap-min)'}],
  ['mail.css','#mm3MailHistoryFilter',{'min-height':'var(--tap-min)'}],
  // 第11版 C章の文字階層: 画面タイトル28 semibold／主要金額30 tabular／項目17／補足13
  ['tokens.css',':root',{'--native-title':'var(--type-title)','--native-body':'var(--type-item)','--native-caption':'var(--type-note)'}],
  ['navigation.css','#app .large-title',{'font-weight':'600'}],
  ['lists.css','.hero-value',{'font-size':'var(--type-amount)'}],
  ['lists.css','#app .row-title',{'font-size':'var(--type-item)'}],
  ['lists.css','#app .row-sub',{'font-size':'var(--type-note)'}],
  // 第11版で追加した部品
  ['settings.css','.feedback-volume',{'grid-template-columns':'auto minmax(0,1fr) auto auto'}],
  ['forms.css','.v11-step-btn',{width:'var(--tap-min)',height:'var(--tap-min)',border:'0','border-radius':'50%',background:'var(--fill)',color:'var(--label)','font-size':'20px','line-height':'1',display:'grid','place-items':'center'}],
  ['forms.css','.v11-step-btn:active',{opacity:'.6'}],
  ['forms.css','.v11-inline-action',{display:'inline-flex','align-items':'center','min-height':'var(--tap-min)','margin-left':'8px',padding:'0 4px',border:'0',background:'transparent',color:'var(--accent)','font-size':'var(--type-note)','font-weight':'600'}],
  ['forms.css','.v11-order-row',{gap:'8px'}],
  ['forms.css','.v11-order-btn',{flex:'none',width:'var(--tap-min)',height:'var(--tap-min)',border:'0','border-radius':'12px',background:'var(--fill)',color:'var(--accent)',display:'grid','place-items':'center'}],
  ['forms.css','.v11-order-btn:disabled',{opacity:'.35'}],
  ['forms.css','.v11-order-btn svg',{width:'20px',height:'20px',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round'}],
];
for(const e of edits)set(...e);
// 幅350px以下ではタイトルを一段小さくする（旧30px→26px）
files['tokens.css'].walkDecls('--native-title',d=>{if(d.parent.parent.type==='atrule')d.value='26px'});
// 幅350px以下では、7列のカレンダーの各日を44pt幅にするため余白を詰める
if(!files['acf.css'].toString().includes('acf-calendar-grid { gap: 0'))files['acf.css'].append(postcss.parse('@media (max-width:350px) {\n  .acf-calendar-grid { gap: 0; margin-inline: -19px }\n}\n'));
for(const [f,root] of Object.entries(files))writeFileSync(resolve(dir,f),root.toString().replace(/\n*$/,'\n'));
console.log('applied',edits.length);
