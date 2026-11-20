
(function(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ms=[].slice.call(document.querySelectorAll('.mascot'));
  if(reduce||!ms.length) return;
  // Blink at random intervals (2.2 to 6 s), 130 ms closed
  ms.forEach(function(m){(function loop(){setTimeout(function(){m.classList.add('blink');setTimeout(function(){m.classList.remove('blink');loop();},130);},2200+Math.random()*3800);})();});
  // Glance: pupils drift up to 3.5 units toward the focused or hovered control
  function look(el){ms.forEach(function(m){var e=m.querySelector('.eyes');if(!e)return;
    if(!el){e.style.transform='';return;}
    var a=m.getBoundingClientRect(),b=el.getBoundingClientRect();
    var dx=(b.left+b.width/2)-(a.left+a.width/2),dy=(b.top+b.height/2)-(a.top+a.height/2),d=Math.hypot(dx,dy)||1;
    e.style.transform='translate('+(dx/d*3.5).toFixed(2)+'px,'+(dy/d*3).toFixed(2)+'px)';});}
  window.csLook=look;
  document.addEventListener('focusin',function(ev){if(ev.target.matches('input,select,textarea,button,.chip'))look(ev.target);});
  document.addEventListener('mouseover',function(ev){var t=ev.target.closest&&ev.target.closest('.chip,input,select,.btn');if(t)look(t);});
  document.addEventListener('focusout',function(){look(null);});
  // Hop on select: the nearest mascot squashes and hops, staggered
  window.csHop=function(){ms.forEach(function(m,i){setTimeout(function(){m.classList.remove('hop');void m.getBoundingClientRect();m.classList.add('hop');},i*70);});};
  document.addEventListener('click',function(ev){var c=ev.target.closest&&ev.target.closest('.chip');if(!c)return;
    var on=c.getAttribute('aria-pressed')!=='true';c.setAttribute('aria-pressed',on);c.classList.toggle('on',on);
    var box=c.querySelector('.box,.tick');if(box)box.innerHTML=on?'<svg class="i sm" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>':'';
    if(on)window.csHop();});
  ms.forEach(function(m){m.addEventListener('animationend',function(e){if(e.animationName==='cs-hop')m.classList.remove('hop');if(e.animationName==='cs-celebrate')m.classList.remove('celebrate');});});
  // Celebrate (used on Review): happy eyes + double bounce
  window.csCelebrate=function(){ms.forEach(function(m,i){m.classList.add('is-happy');setTimeout(function(){m.classList.remove('celebrate');void m.getBoundingClientRect();m.classList.add('celebrate');},i*90);});};
  if(document.body.dataset.celebrate==='1') setTimeout(window.csCelebrate,500);
})();
