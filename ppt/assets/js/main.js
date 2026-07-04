/* ════════════════════════════════════════════════
   main.js · 幻灯片切换 + 入场特效
   依赖：flow.js (FlowChars)
════════════════════════════════════════════════ */
const slides=[...document.querySelectorAll('.slide')];
const dotsEl=document.getElementById('dots');
const counterEl=document.getElementById('counter');
const hudSlideEl=document.getElementById('hudSlide');
let current=0;
const flows=new Map();
const entered=new Set();

slides.forEach((s,i)=>{
const d=document.createElement('div');d.className='dot'+(i===0?' active':'');
d.onclick=()=>go(i);dotsEl.appendChild(d);
});
slides.forEach(slide=>{
const cs=slide.querySelectorAll('canvas.flow');
flows.set(slide,[...cs].map(c=>new FlowChars(c,JSON.parse(c.dataset.flow||'{}'))));
});

function go(i){
i=Math.max(0,Math.min(slides.length-1,i));
if(i===current && entered.has(i))return;
flows.get(slides[current])?.forEach(f=>f.stop());
slides[current].classList.remove('active');
current=i;
const slide=slides[i];
slide.classList.add('active');
setTimeout(()=>flows.get(slide)?.forEach(f=>f.start()),40);
[...dotsEl.children].forEach((d,k)=>d.classList.toggle('active',k===i));
const tag=String(i+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
counterEl.textContent=tag;hudSlideEl.textContent=tag;
if(!entered.has(i)){entered.add(i);runEffect(slide,i);}
}

function runEffect(slide,i){
const eff=slide.dataset.effect;
if(eff==='languages')effLanguages();
else if(eff==='cta')effCTA();
}
function effLanguages(){
const el=document.getElementById('s5Count');const to=200;let v=0;
const tick=()=>{v+=Math.max(2,Math.ceil((to-v)/9));if(v>=to){el.textContent=to;return;}el.textContent=v;requestAnimationFrame(tick);};
setTimeout(tick,400);
}
function effCTA(){
const el=document.getElementById('s9Typed');const text='./gualingo --text "任意一段文字"';
el.textContent='';let i=0;
const type=()=>{if(i<=text.length){el.textContent=text.slice(0,i);i++;setTimeout(type,55);}};
setTimeout(type,600);
}

document.addEventListener('keydown',e=>{
if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();go(current+1);}
else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();go(current-1);}
else if(e.key==='Home')go(0);
else if(e.key==='End')go(slides.length-1);
});
let wheelLock=false;
document.addEventListener('wheel',e=>{
if(wheelLock)return;if(Math.abs(e.deltaY)<30)return;
wheelLock=true;if(e.deltaY>0)go(current+1);else go(current-1);
setTimeout(()=>wheelLock=false,650);
},{passive:true});
let touchY=null;
document.addEventListener('touchstart',e=>touchY=e.touches[0].clientY,{passive:true});
document.addEventListener('touchend',e=>{
if(touchY===null)return;const dy=e.changedTouches[0].clientY-touchY;
if(Math.abs(dy)>50){if(dy<0)go(current+1);else go(current-1);}touchY=null;
},{passive:true});

function tickClock(){const d=new Date();const p=n=>String(n).padStart(2,'0');
document.getElementById('hudClock').textContent=`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}
setInterval(tickClock,1000);tickClock();
go(0);
