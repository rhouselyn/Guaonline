/* ════════════════════════════════════════════════
   flow.js · 多语言字符流动引擎
   - mode: 'phrases' 短语流动 | 'twinkle' 短语闪烁
   - dir:  'down' | 'up' | 'left' | 'right' （单方向）
   - vertical: true 竖排（短语逐字纵向书写）
   - 透明清屏，毛玻璃后透出 body 渐变
════════════════════════════════════════════════ */

/* 多文字体系字符集 */
const CHARSETS={
multilang:'ABCDEFGHabcdｱｲｳｴｵｶｷｸ你好世界语言学习沉浸式АБВГабвг0123456789ािीूαβγδε',
latin:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÉÊÇÏÖÑÜßØÆ',
cyrillic:'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя',
cjk:'你好世界语言学习沉浸式语境翻译词典音标词形句法语法练习听说读写测试一二三四五六七八十',
arabic:'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
devanagari:'अआइईउऊएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह',
hangul:'가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허',
greek:'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω',
thai:'กขคงจฉชซญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอ',
runes:'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ',
ethiopic:'ሀለሐመሠረሰሸቀበተኀነኘአከኸወዐዘዠየደጀገጠጨጰጸፀፈፐ',
};

/* 真实多语言短语：让背景文字有意义 */
const PHRASES={
// 通用：世界各语言的"你好/学习/语言"等真实词句
greetings:[
'Hello','Bonjour','Hola','你好','こんにちは','안녕하세요',
'Здравствуй','مرحبا','नमस्ते','สวัสดี','Γειά σου','Olá',
'Ciao','Hallo','Hej','Cześć','Merhaba','Szia'
],
learn:[
'learn','apprendre','aprender','学ぶ','배우다','учить',
'تعلم','सीखना','เรียน','μαθαίνω','imparare','lernen',
'leren','uczyć','öğren','tanulni','læra','oppia'
],
language:[
'language','langue','idioma','言語','언어','язык',
'لغة','भाषा','ภาษา','γλώσσα','lingua','Sprache',
'taal','język','dil','nyelv','språk','kieli'
],
world:[
'one world','un monde','un mundo','一つの世界','하나의 세계',
'один мир','عالم واحد','एक दुनिया','หนึ่งโลก','ένας κόσμος',
'un mondo','eine Welt','een wereld','jeden świat','tek dünya'
],
// 各语系真实词句（带翻译，更有意义）
phrases_zh:['你好世界','学一门语言','任意文本','沉浸式学习','全球传播','200种语言'],
phrases_fr:['Bonjour le monde','Apprendre une langue','Texte libre','Immersion totale'],
phrases_de:['Hallo Welt','Eine Sprache lernen','Freier Text','Totales Eintauchen'],
phrases_ja:['こんにちは世界','言語を学ぶ','任意のテキスト','没入学習'],
phrases_ko:['안녕하세요 세계','언어 배우기','자유 텍스트','몰입 학습'],
phrases_ar:['مرحبا بالعالم','تعلم لغة','نص حر','تعلم غامر'],
phrases_ru:['Привет мир','Учить язык','Любой текст','Иммерсивное обучение'],
phrases_hi:['नमस्ते दुनिया','भाषा सीखें','कोई भी टेक्स्ट','गहन अध्ययन'],
// 全语种合并池（200 语言页用）
all:[
'Hello','Bonjour','Hola','你好','こんにちは','안녕하세요','Здравствуй','مرحبا','नमस्ते','สวัสดี',
'Ciao','Hallo','Hej','Merhaba','Szia','Olá','Γειά σου','Apprendre','Learn','学ぶ',
'배우다','учить','تعلم','सीखना','imparare','lernen','语言','言語','언어','язык',
'langue','idioma','lingua','Sprache','你好世界','Bonjour le monde','Hola mundo',
'Hallo Welt','Ciao mondo','Olá mundo','one world','un monde','un mundo',
],
};

class FlowChars{
constructor(c,o){
this.canvas=c;this.ctx=c.getContext('2d');
this.opts=Object.assign({
mode:'phrases',
phrases:'greetings',
color:'#6B8A5E',
size:34,
density:0.35,
dir:'down',
speed:0.12,
vertical:false,
},o);
this.pool=PHRASES[this.opts.phrases]||PHRASES.greetings;
this.running=false;
this.resize();
window.addEventListener('resize',()=>this.resize());
}
pickPhrase(){return this.pool[Math.floor(Math.random()*this.pool.length)];}
resize(){
const dpr=Math.min(window.devicePixelRatio||1,2);
const r=this.canvas.getBoundingClientRect();
this.w=Math.max(1,r.width);this.h=Math.max(1,r.height);
this.canvas.width=this.w*dpr;this.canvas.height=this.h*dpr;
this.ctx.setTransform(dpr,0,0,dpr,0,0);
this.fontSize=this.opts.size;
this.ctx.font=`${this.fontSize}px 'Noto Serif SC','Noto Sans JP',serif`;
this.particles=[];
const n=Math.max(6,Math.floor((this.w/this.fontSize)*this.opts.density));
// 调色板：发布会风格高级渐变（蛙绿/琥珀/红土三色系）
this.palette=[
[107,138,94],   // 蛙绿
[150,138,94],   // 蛙绿偏暖
[200,138,44],   // 琥珀
[184,85,48],    // 红土
[140,110,70],   // 暖褐
];
for(let i=0;i<n;i++) this.particles.push(this.spawn(true,i));
// 透明清屏，让 body 渐变透出
this.ctx.clearRect(0,0,this.w,this.h);
}
measure(txt){return this.ctx.measureText(txt).width;}
// 竖排高度：每个字符一行
vHeight(txt){return txt.length*this.fontSize;}
spawn(init=false,idx=0){
const dir=this.opts.dir;
const txt=this.pickPhrase();
const tw=this.measure(txt)||this.fontSize*2;
const vh=this.opts.vertical?this.vHeight(txt):tw;
const sp=this.opts.speed*this.fontSize;
// 按索引循环分配调色板颜色
const c=this.palette[idx%this.palette.length];
// 随机选一个渐变方向（顶深底浅 / 顶浅底深），制造条纹层次
const gradFlip=Math.random()>0.5;
let x,y,vx=0,vy=0;
if(dir==='down'){vy=sp;}
else if(dir==='up'){vy=-sp;}
else if(dir==='left'){vx=-sp;}
else if(dir==='right'){vx=sp;}
if(init){
  // 初始：分散在整个屏幕 + 屏幕外，保证持续有粒子流动
  x=Math.random()*this.w;
  if(dir==='down'){y=Math.random()*(this.h+vh)-vh;}
  else if(dir==='up'){y=Math.random()*(this.h+vh);}
  else{y=Math.random()*this.h;}
}else{
  // 重生：在屏幕外重新进入，加随机偏移避免同时到达
  if(dir==='down'){x=Math.random()*this.w;y=-vh-Math.random()*this.h*0.6;}
  else if(dir==='up'){x=Math.random()*this.w;y=this.h+vh+Math.random()*this.h*0.6;}
  else if(dir==='left'){x=this.w+tw+Math.random()*this.w*0.6;y=Math.random()*this.h;}
  else if(dir==='right'){x=-tw-Math.random()*this.w*0.6;y=Math.random()*this.h;}
}
return {x,y,vx,vy,dir,txt,tw,vh,c,gradFlip,
alpha:(this.opts.mode==='twinkle')?0.15:(0.22+Math.random()*0.22),
twPhase:Math.random()*Math.PI*2,
twSpeed:0.012+Math.random()*0.02,
twAmp:0.16+Math.random()*0.2,
isTwinkle:this.opts.mode==='twinkle'};
}
drawText(p){
// 竖排：逐字纵向书写
const [r,g,b]=p.c;
if(this.opts.vertical){
const chars=[...p.txt];
// 居中 x 对齐到字宽
const cw=this.fontSize;
// 竖排逐字渐变：首字深、末字浅
for(let i=0;i<chars.length;i++){
const t=i/(chars.length-1||1);
const k=p.gradFlip?(1-t*0.7):(0.4+t*0.6); // 0.4~1.0 明度系数
this.ctx.fillStyle=`rgb(${Math.round(r*k)},${Math.round(g*k)},${Math.round(b*k)})`;
this.ctx.fillText(chars[i],p.x,p.y+i*this.fontSize);
}
}else{
// 横排整体用粒子色
this.ctx.fillStyle=`rgb(${r},${g},${b})`;
this.ctx.fillText(p.txt,p.x,p.y);
}
}
start(){if(this.running)return;this.running=true;this.resize();this.loop();}
stop(){this.running=false;if(this._raf)cancelAnimationFrame(this._raf);}
loop(){
if(!this.running)return;
const {ctx,fontSize,w,h,opts}=this;
// 透明清屏，让 body 渐变透出
ctx.clearRect(0,0,w,h);
ctx.font=`${this.fontSize}px 'Noto Serif SC','Noto Sans JP',serif`;
ctx.textBaseline='top';
for(const p of this.particles){
if(p.isTwinkle){
p.twPhase+=p.twSpeed;
p.alpha=0.15+p.twAmp*(0.5+0.5*Math.sin(p.twPhase));
if(Math.random()<0.003){p.txt=this.pickPhrase();}
}else{
p.x+=p.vx;p.y+=p.vy;
const bound=this.opts.vertical?p.vh:p.tw;
// 仅按粒子运动方向判断是否完全出界，避免入屏侧误触发重生
let out=false;
if(p.dir==='up'){out=p.y<-bound-fontSize;}
else if(p.dir==='down'){out=p.y>h+fontSize;}
else if(p.dir==='left'){out=p.x<-bound-fontSize;}
else if(p.dir==='right'){out=p.x>w+fontSize;}
if(out){
// 重生：保留原色，避免颜色跳变
const keepC=p.c,keepFlip=p.gradFlip;
Object.assign(p,this.spawn(false));
p.c=keepC;p.gradFlip=keepFlip;
}
}
ctx.globalAlpha=p.alpha;
this.drawText(p);
}
ctx.globalAlpha=1;
this._raf=requestAnimationFrame(()=>this.loop());
}
}
