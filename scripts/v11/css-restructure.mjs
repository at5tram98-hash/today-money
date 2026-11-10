/* CSSの層をなくす再構築。
   1. 全ファイルを結合順に読み、セレクタ1つ＝1項目に分解する
   2. 同じセレクタ（同じ@条件）で後から上書きされて効かなくなった宣言を取り除く
   3. 同じセレクタの規則を1つにまとめる（他の規則との優先順位が変わる場合はまとめない）
   4. 部品ごとのファイルへ並べ替える（優先順位が変わる組は元の前後関係を守る）
   2026-11 に一度だけ実行した移行用の記録。入力は移行前のリポジトリ（旧 src/css と manifest）で、現在のソースに対して再実行するものではない。
   usage: node css-restructure.mjs <移行前のリポジトリ> <巡回で集めた要素一覧.json> <出力先> */
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const [repo,elementsPath,outDir]=process.argv.slice(2);
const postcss=createRequire(resolve(repo,'package.json'))('postcss');
const manifest=JSON.parse(readFileSync(resolve(repo,'src/manifest.json'),'utf8'));
const source=manifest.styles.map(f=>readFileSync(resolve(repo,f),'utf8')).join('\n');
const root=postcss.parse(source);

/* ---------- selectors ---------- */
function splitTop(text,separators){const out=[];let depth=0,cur='';for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='('||ch==='[')depth++;if(ch===')'||ch===']')depth--;if(depth===0&&separators.includes(ch)){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out}
function compounds(selector){const s=selector.replace(/\s*([>+~])\s*/g,'$1').trim();return splitTop(s,[' ','>','+','~']).filter(Boolean)}
function compoundParts(c){
  const parts={tag:'',id:'',classes:[],pseudoElement:'',spec:[0,0,0]};let i=0;
  const tag=c.match(/^([a-zA-Z][\w-]*|\*)/);if(tag){if(tag[0]!=='*'){parts.tag=tag[0].toLowerCase();parts.spec[2]++}i=tag[0].length}
  while(i<c.length){
    const ch=c[i];
    if(ch==='#'){const m=c.slice(i).match(/^#[\w-]+/);parts.id=m[0].slice(1);parts.spec[0]++;i+=m[0].length}
    else if(ch==='.'){const m=c.slice(i).match(/^\.[\w-]+/);parts.classes.push(m[0].slice(1));parts.spec[1]++;i+=m[0].length}
    else if(ch==='['){let d=0,j=i;for(;j<c.length;j++){if(c[j]==='[')d++;if(c[j]===']'){d--;if(!d)break}}parts.spec[1]++;i=j+1}
    else if(ch===':'){
      const m=c.slice(i).match(/^::?[\w-]+/),name=m[0].replace(/^::?/,''),element=m[0].startsWith('::')||/^(before|after|first-line|first-letter)$/.test(name);i+=m[0].length;let arg=null;
      if(c[i]==='('){let d=0,j=i;for(;j<c.length;j++){if(c[j]==='(')d++;if(c[j]===')'){d--;if(!d)break}}arg=c.slice(i+1,j);i=j+1}
      if(element){parts.pseudoElement=name+(arg?`(${arg})`:'');parts.spec[2]++}
      else if(name==='where'){}
      else if(/^(not|is|has|matches)$/.test(name)){let best=[0,0,0];for(const a of splitTop(arg,[','])){const s=specificity(a.trim());if(cmp(s,best)>0)best=s}for(let k=0;k<3;k++)parts.spec[k]+=best[k]}
      else parts.spec[1]++;
    }else throw new Error('cannot parse compound: '+c);
  }
  return parts;
}
const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
function specificity(selector){const s=[0,0,0];for(const c of compounds(selector)){const p=compoundParts(c);for(let k=0;k<3;k++)s[k]+=p.spec[k]}return s}
const subject=selector=>compoundParts(compounds(selector).at(-1));

/* ---------- observed elements (which class combinations really occur) ---------- */
const observed=JSON.parse(readFileSync(elementsPath,'utf8')).map(sig=>{const m=sig.match(/^([a-z0-9-]+)(#[^.]+)?(.*)$/);return{tag:m[1],id:(m[2]||'').slice(1),classes:new Set(m[3].split('.').filter(Boolean))}});
const knownClasses=new Set(observed.flatMap(o=>[...o.classes])),knownIds=new Set(observed.map(o=>o.id).filter(Boolean));
/* スクリプトとHTMLに書かれた class 属性から、同じ要素に付きうるクラスの組を求める */
import {readdirSync} from 'node:fs';
const scripts=readdirSync(resolve(repo,'src/js')).map(f=>readFileSync(resolve(repo,'src/js',f),'utf8')).join('\n')+readFileSync(resolve(repo,'src/index.html'),'utf8');
const attrSets=[...scripts.matchAll(/class(?:Name)?\s*=\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map(m=>({classes:new Set(m[2].match(/[a-zA-Z_][\w-]*/g)||[]),open:m[2].includes('${')}));
const inAttr=new Set(attrSets.flatMap(s=>[...s.classes]));
const dynamic=new Set([...scripts.matchAll(/classList\.(?:add|toggle|remove|replace)\(([^)]*)\)/g)].flatMap(m=>m[1].match(/[a-zA-Z_][\w-]*/g)||[]));
const floating=new Set([...scripts.matchAll(/(?<!class=)(?<!className=)(["'`])([a-zA-Z_][\w-]*(?: [a-zA-Z_][\w-]*)*)\1/g)].flatMap(m=>m[2].split(' ')));
const tokenAnywhere=c=>new RegExp('(?<![\\w-])'+c.replace(/[-]/g,'\\-')+'(?![\\w-])').test(scripts);
const composed=c=>/^acf-(safe|watch|over|danger|caution|ok)$/.test(c);   // acf-${safety}
const isDeadClass=c=>!knownClasses.has(c)&&!inAttr.has(c)&&!dynamic.has(c)&&!composed(c)&&!tokenAnywhere(c);
const comatchCache=new Map();
function comatch(a,b){
  if(a.pseudoElement!==b.pseudoElement)return false;
  if(a.id&&b.id&&a.id!==b.id)return false;
  if(a.tag&&b.tag&&a.tag!==b.tag)return false;
  const key=[a.tag,a.id,a.classes.join('.'),b.tag,b.id,b.classes.join('.')].join('|');if(comatchCache.has(key))return comatchCache.get(key);
  const tag=a.tag||b.tag,id=a.id||b.id,classes=[...new Set([...a.classes,...b.classes])];
  let result=observed.some(o=>(!tag||o.tag===tag)&&(!id||o.id===id)&&classes.every(c=>o.classes.has(c)));
  if(!result){
    // 巡回で見えなかった組み合わせは、class属性の記述から判断する。状態クラス（classListで付け外しするもの）はどの要素にも付きうる
    const fixed=classes.filter(c=>!dynamic.has(c));
    if(fixed.some(c=>!inAttr.has(c)&&!knownClasses.has(c)))result=true;                        // 出どころを特定できないクラス
    else if(fixed.length<=1)result=fixed.length===0||!a.classes.length||!b.classes.length||dynamic.has(a.classes[0])||dynamic.has(b.classes[0])||a.classes.join()===b.classes.join();
    else result=attrSets.some(s=>{const missing=fixed.filter(c=>!s.classes.has(c));return!missing.length||(s.open&&missing.every(c=>floating.has(c)))});
  }
  comatchCache.set(key,result);return result;
}

/* ---------- properties ---------- */
const unprefix=p=>p.replace(/^-(webkit|moz|ms)-/,'');
const SHORT={margin:/^margin-/,padding:/^padding-/,inset:/^(top|right|bottom|left|inset-.*)$/,border:/^border-(top|right|bottom|left|color|style|width|image)(-|$)/,'border-top':/^border-top-(color|style|width)$/,'border-right':/^border-right-(color|style|width)$/,'border-bottom':/^border-bottom-(color|style|width)$/,'border-left':/^border-left-(color|style|width)$/,'border-color':/^border-(top|right|bottom|left)-color$/,'border-style':/^border-(top|right|bottom|left)-style$/,'border-width':/^border-(top|right|bottom|left)-width$/,'border-radius':/^border-(top|bottom)-(left|right)-radius$/,background:/^background-/,font:/^(font-(style|variant|weight|stretch|size|family)|line-height)$/,flex:/^flex-(grow|shrink|basis)$/,'flex-flow':/^flex-(direction|wrap)$/,gap:/^(row|column)-gap$/,overflow:/^overflow-[xy]$/,outline:/^outline-(color|style|width)$/,transition:/^transition-/,animation:/^animation-/,'place-items':/^(align|justify)-items$/,'place-content':/^(align|justify)-content$/,'place-self':/^(align|justify)-self$/,'text-decoration':/^text-decoration-/,'list-style':/^list-style-/,'grid-template':/^grid-template-/,'grid-area':/^grid-(row|column)(-start|-end)?$/,'grid-column':/^grid-column-(start|end)$/,'grid-row':/^grid-row-(start|end)$/,mask:/^mask-/};
const covers=(later,earlier)=>later===earlier||(unprefix(later)===unprefix(earlier)&&later===earlier)||(!!SHORT[later]&&SHORT[later].test(earlier));
function family(prop){
  if(prop.startsWith('--'))return prop;const p=unprefix(prop);
  if(/^border-.*radius$/.test(p))return'border-radius';
  if(/^(top|right|bottom|left|inset)/.test(p))return'inset';
  if(/^(row-gap|column-gap|gap|grid-gap)$/.test(p))return'gap';
  if(/^(align|justify|place)-/.test(p))return'align';
  if(p==='line-height')return'font';
  if(/^(white-space|text-wrap)/.test(p))return'white-space';
  const m=p.match(/^(margin|padding|border|background|font|overflow|flex|grid|transition|animation|outline|text-decoration|list-style|mask|scroll-margin|scroll-padding|scroll-snap|overscroll|columns|min-|max-)/);
  if(p==='min-width'||p==='max-width'||p==='min-height'||p==='max-height')return p;
  return m?m[1]:p;
}
const isShort=p=>!!SHORT[p]||/^(font|border|background|flex|grid|transition|animation|outline|inset|gap|overflow|margin|padding|mask|columns|all|place-(items|content|self)|text-decoration|list-style|border-(top|right|bottom|left|color|style|width|radius|image|block|inline))$/.test(unprefix(p));
const related=(a,b)=>a===b||unprefix(a)===unprefix(b)||(family(a)===family(b)&&(isShort(a)||isShort(b)));

/* ---------- 1. decompose ---------- */
const normalizeContext=text=>text.replace(/\s+/g,' ').replace(/\s*:\s*/g,':').replace(/\s*,\s*/g,',').trim();
const entries=[],opaque=new Map();let ord=0;
function walk(container,context){
  for(const node of container.nodes||[]){
    if(node.type==='comment')continue;
    if(node.type==='atrule'){
      if(/keyframes$/.test(node.name)||node.name==='font-face'||node.name==='property'){opaque.set(node.name+' '+node.params,node.toString());continue}
      if(node.name==='media'||node.name==='supports'||node.name==='container'){walk(node,[...context,`@${node.name} ${normalizeContext(node.params)}`]);continue}
      throw new Error('unsupported at-rule '+node.name);
    }
    if(node.type==='rule'){
      ord++;const decls=[];let n=0;
      node.each(d=>{if(d.type==='comment')return;if(d.type!=='decl')throw new Error('unexpected '+d.type);decls.push({prop:d.prop.startsWith('--')?d.prop:d.prop.toLowerCase(),value:d.value.replace(/\s+/g,' ').trim(),important:!!d.important,ord,n:n++})});
      for(const selector of node.selectors){const s=selector.replace(/\s+/g,' ').replace(/\s*([>+~])\s*/g,'$1').trim();entries.push({context:context.join(' && '),selector:s,key:context.join(' && ')+' § '+s,decls:decls.map(d=>({...d})),ord})}
      continue;
    }
    throw new Error('unexpected node '+node.type);
  }
}
walk(root,[]);
/* どこからも使われていないクラスの規則（過去の版の残り）を取り除く */
const outsideNot=s=>{let out='',depth=0;for(let i=0;i<s.length;i++){if(s.startsWith(':not(',i)){let d=0,j=i+4;for(;j<s.length;j++){if(s[j]==='(')d++;if(s[j]===')'){d--;if(!d)break}}i=j;continue}out+=s[i]}return out};
const deadClasses=new Set(),before=entries.length;
for(let i=entries.length-1;i>=0;i--){const dead=(outsideNot(entries[i].selector).match(/\.[a-zA-Z_][\w-]*/g)||[]).map(c=>c.slice(1)).filter(isDeadClass);if(dead.length){dead.forEach(c=>deadClasses.add(c));entries.splice(i,1)}}

const stats={sourceBytes:source.length,rules:ord,entries:before,unusedClassSelectorsRemoved:before-entries.length,unusedClasses:[...deadClasses].sort(),declarations:entries.reduce((n,e)=>n+e.decls.length,0)};

/* ---------- 2. remove declarations that a later rule of the same selector overrides ---------- */
const byKey=new Map();for(const e of entries){if(!byKey.has(e.key))byKey.set(e.key,[]);byKey.get(e.key).push(e)}
let dead=0;
for(const list of byKey.values()){
  const all=list.flatMap(e=>e.decls.map(d=>({d,e})));
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const a=all[i],b=all[j];if(a.e===b.e||a.d.dead||b.d.dead)continue;   // 同じ規則内の重複は代替値の指定なので残す
    if(covers(b.d.prop,a.d.prop)&&(b.d.important||!a.d.important)){a.d.dead=true;dead++;break}
    if(a.d.prop===b.d.prop&&a.d.important&&!b.d.important){b.d.dead=true;dead++}
  }
}
for(const e of entries)e.decls=e.decls.filter(d=>!d.dead);
let nodes=entries.filter(e=>e.decls.length).map((e,i)=>({id:i,key:e.key,context:e.context,selector:e.selector,decls:e.decls,ord:e.ord,spec:specificity(e.selector),subject:subject(e.selector),out:new Set(),in:new Set()}));
stats.deadDeclarations=dead;

/* ---------- 3. ordering constraints between rules that can compete on the same element ---------- */
const famIndex=new Map();
for(const n of nodes)for(const f of new Set(n.decls.map(d=>family(d.prop)))){if(!famIndex.has(f))famIndex.set(f,[]);famIndex.get(f).push(n)}
let edges=0;
for(const list of famIndex.values())for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
  const a=list[i],b=list[j];if(a.key===b.key||a.ord===b.ord||cmp(a.spec,b.spec)!==0||a.out.has(b)||b.out.has(a))continue;
  let compete=false;
  for(const da of a.decls){for(const db of b.decls){if(da.important!==db.important||!related(da.prop,db.prop))continue;if(da.prop===db.prop&&da.value===db.value)continue;compete=true;break}if(compete)break}
  if(!compete||!comatch(a.subject,b.subject))continue;
  const [first,second]=a.ord<b.ord?[a,b]:[b,a];first.out.add(second);second.in.add(first);edges++;
}
stats.orderingConstraints=edges;
if(process.env.DEBUG_EDGES){const c=new Map();for(const n of nodes)for(const m of n.out){if(n.bucketPreview===undefined){}const k=n.selector+'  →  '+m.selector;c.set(n.selector,(c.get(n.selector)||0)+1)}console.log([...c.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25))}

/* ---------- merge rules of the same selector unless that would reverse a constraint ---------- */
function reaches(from,to){const seen=new Set([from]),stack=[from];while(stack.length){const n=stack.pop();for(const m of n.out){if(m===to)return true;if(!seen.has(m)){seen.add(m);stack.push(m)}}}return false}
let merged=0,kept=0;const groups=new Map();for(const n of nodes){if(!groups.has(n.key))groups.set(n.key,[]);groups.get(n.key).push(n)}
const removed=new Set();
for(const list of groups.values()){
  let target=list[0];
  for(const next of list.slice(1)){
    if(reaches(target,next)||reaches(next,target)){kept++;target=next;continue}
    target.decls.push(...next.decls);
    for(const m of next.out){m.in.delete(next);if(m!==target){m.in.add(target);target.out.add(m)}}
    for(const m of next.in){m.out.delete(next);if(m!==target){m.out.add(target);target.in.add(m)}}
    removed.add(next);merged++;
  }
}
nodes=nodes.filter(n=>!removed.has(n));
for(const n of nodes)n.decls.sort((a,b)=>a.ord-b.ord||a.n-b.n);
stats.mergedRules=merged;stats.sameSelectorRulesKeptApart=kept;

/* ---------- 4. component files ---------- */
let MATCH_ORDER;
const FILES=[
  ['tokens','デザイントークン（色・文字・間隔・動き）。値の定義はここだけに置く。',/^(:root|html)(\.[\w-]+)*$/],
  ['base','文書全体の基礎（リセット、本文、スクロール、共通の状態クラス）。',/^(\*|html|body|button|input|select|textarea|a|svg|img|table|\[|:focus|::|\.hidden|\.visually|\.screen|\.scroll|\.green|\.red|\.orange|\.blue|\.label2|\.press|\.empty|\.badge|\.dot|\.svg|\.number|\.saving)\b/],
  ['navigation','タブバー、上部ナビゲーション、大見出し、今日／今月の切替。',/^\.(tabbar|tab|topbar|nav|large|native-home|home-mode|back|icon-btn|icon|date-nav|display-month|favorite|fav|motion)/],
  ['layers','下層画面（push）、シート、ダイアログ、メニュー、トースト、処理中表示。',/^(#sheet|#pushLayer|#lockScreen|\.(sheet|push|alert|menu|toast|busy|dim|grabber|lock))/],
  ['forms','ボタン、入力欄、スイッチ、セグメント、選択部品。',/^\.(primary|secondary|field|form|seg|switch|choice|pill|filter|searchbox|input|danger|action|inline|compact|status|section|category|cat|tag|v11)/],
  ['lists','グループ化された行、カード、ヒーロー表示、指標。',/^\.(group|row|chev|card|hero|metric|summary|mini|quick|shortcut|entity|simple|unknown|brand|merchant|source|storage|legend|bar|bars|hbar|hbars|donut|spark|ring|chart|compare|week|schedule)/],
  ['money-input','電卓、月ホイール、承認スライド。',/^(#calculator|\.(calc|month-wheel|month-picker|approval))/],
  ['home','今日・今月の画面、カレンダー、資金ティッカー、通知。',/^(#screen-today|#screen-month|#quickExpense|\.(today|month|calendar|day-cell|money|budget|daily|plan|planner|goal|safety|impact|scenario|rebalance|feedback))/],
  ['day-closing','日締めの照合と承認、ジャーナル。',/^\.(day)/],
  ['salary','給与の画面と編集。',/^(#screen-pay\b|#payContent|\.(pay|salary|income|employer))/],
  ['payments','支払いの画面、ATF、請求。',/^(#screen-payments|#paymentsContent|\.(payment|billing|credit|debit|atf|statement|financial))/],
  ['assets','資産の画面、口座・カードの詳細。',/^(#screen-assets|#assetsTop|\.(asset|assets|account|stock|pro3|pro4|pro))/],
  ['acf','ACF（現金・カード予測）の表、カレンダー、設定。',/^(#acfTableMode|\.(acf|cashflow|cf|risk|confidence))/],
  ['mail','メール取引と明細取込。',/^\.(mail|gmail|stmt)/],
  ['settings','設定、プロフィール。',/^\.(settings|profile)/],
  ['components','その他の共通部品。',/./],
];
MATCH_ORDER=FILES.map(f=>f[0]);
if(process.env.FILE_ORDER){const names=process.env.FILE_ORDER.split(',');FILES.sort((x,y)=>names.indexOf(x[0])-names.indexOf(y[0]))}
const head=selector=>selector.replace(/^(html|body)(\.[\w-]+)*[ >]/,'').replace(/^#app(\.[\w-]+)*[ >]?/,'').replace(/^(html|body)(\.[\w-]+)*[ >]/,'')||selector;
const mm3=s=>{const m=s.match(/^\.mm3-(salary|payment|atf|assets?|mail|action|income)/);return m?({salary:'salary',payment:'payments',atf:'payments',asset:'assets',assets:'assets',mail:'mail',income:'salary'})[m[1]]:null};
function bucket(n){
  if(/^(:root|html)(\.[\w-]+)*$/.test(n.selector)&&n.decls.every(d=>d.prop.startsWith('--')||d.prop==='color-scheme'))return 0;
  const h=head(n.selector),special=mm3(h);if(special)return FILES.findIndex(f=>f[0]===special);
  for(const name of MATCH_ORDER){const i=FILES.findIndex(f=>f[0]===name);if(i>0&&FILES[i][2].test(h))return i}return FILES.findIndex(f=>f[0]==='components');
}
const contexts=[...new Set(nodes.map(n=>n.context))];
const contextRank=c=>c===''?0:1+contexts.filter(Boolean).indexOf(c);
for(const n of nodes){n.bucket=bucket(n);n.rank=[n.bucket,contextRank(n.context),n.ord,n.id]}
const less=(a,b)=>{for(let i=0;i<4;i++)if(a.rank[i]!==b.rank[i])return a.rank[i]<b.rank[i];return false};
// 部品→@条件→元の順に並べる。先に置く必要のある規則（同じ要素・同じ優先度で競合し、元は前にあった規則）は、その直前へ引き寄せる
const sorted=[...nodes].sort((a,b)=>less(a,b)?-1:less(b,a)?1:0),done=new Set(),order=[];let displaced=0;
for(const start of sorted){
  if(done.has(start))continue;
  const stack=[[start,[...start.in].sort((a,b)=>less(a,b)?-1:1)]],onStack=new Set([start]);
  while(stack.length){
    const [n,preds]=stack.at(-1);let next=null;
    while(preds.length){const p=preds.shift();if(!done.has(p)){if(onStack.has(p))throw new Error('ordering cycle at '+p.selector);next=p;break}}
    if(next){onStack.add(next);stack.push([next,[...next.in].sort((a,b)=>less(a,b)?-1:1)]);continue}
    stack.pop();onStack.delete(n);done.add(n);n.file=start.bucket;if(n.bucket!==start.bucket)displaced++;order.push(n);
  }
}
if(order.length!==nodes.length)throw new Error('ordering lost rules');
stats.rulesPlacedOutsideTheirComponent=displaced;

const text=n=>n.decls.map(d=>`${d.prop}: ${d.value}${d.important?' !important':''}`).join('; ');
rmSync(outDir,{recursive:true,force:true});mkdirSync(outDir,{recursive:true});
const written=[];let outRules=0,outBytes=0;
for(let f=0;f<FILES.length;f++){
  const list=order.filter(n=>n.file===f);if(!list.length&&FILES[f][0]!=='base')continue;
  let css=`/* ${FILES[f][1]} */\n`,open='';const lines=[];
  if(FILES[f][0]==='base'){css+=[...opaque.values()].map(x=>x.replace(/\s*\n\s*/g,' ')).join('\n')+'\n'}
  for(let i=0;i<list.length;){
    const n=list[i],body=text(n),selectors=[n.selector];let j=i+1;
    while(j<list.length&&list[j].context===n.context&&text(list[j])===body){selectors.push(list[j].selector);j++}
    lines.push({context:n.context,line:`${selectors.join(',\n')} { ${body} }`});outRules++;i=j;
  }
  for(const l of lines){
    if(l.context!==open){if(open)css+='}'.repeat(open.split(' && ').length)+'\n';if(l.context)css+=l.context.split(' && ').join(' { ')+' {\n';open=l.context}
    css+=(open?l.line.replace(/^/gm,'  '):l.line)+'\n';
  }
  if(open)css+='}'.repeat(open.split(' && ').length)+'\n';
  writeFileSync(resolve(outDir,FILES[f][0]+'.css'),css);written.push(FILES[f][0]+'.css');outBytes+=css.length;
}
stats.outputRules=outRules;stats.outputBytes=outBytes;stats.outputDeclarations=nodes.reduce((n,x)=>n+x.decls.length,0);stats.files=written;
writeFileSync(resolve(outDir,'restructure-stats.json'),JSON.stringify(stats,null,1));
console.log(JSON.stringify(stats,null,1));
