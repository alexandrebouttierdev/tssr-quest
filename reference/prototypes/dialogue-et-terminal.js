const UI=(()=>{
const stage=document.getElementById('stage');
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;};
let busy=false,done=false,termOpen=false,onDone=()=>{};

/* Portrait pixel d'Hugo */
const FACE=["................",".....KKKKKK.....","....KxxxxxxK....","...KxxxxxxxxK...","...KxxxxxxxxK...","...KxssssssxK...","...KsKssssKsK...","...KssssssssK...","....KSSSSSSK....",".....KKSSKK.....","...KKvvvvvvKK...","..KvvvvaavvvvK..","..KvVvvvvvvVvK..","..KvVvvvvvvVvK.."];
const PAL={K:'#0e1116',x:'#2b2b2b',s:'#d6a27c',S:'#5a4030',v:'#e0884f',V:'#b0602e',a:'#f2b54a'};
function face(){const c=el('canvas','face');c.width=16;c.height=14;const g=c.getContext('2d');
  FACE.forEach((r,y)=>[...r].forEach((ch,x)=>{if(PAL[ch]){g.fillStyle=PAL[ch];g.fillRect(x,y,1,1);}}));return c;}

/* Boîte de dialogue */
const box=el('div','dlg');box.hidden=true;box.setAttribute('aria-live','polite');
const col=el('div','dlg-col'),nm=el('p','nm','Hugo · Admin systèmes'),tx=el('p','tx'),chs=el('div','ch'),more=el('span','more','▼');
col.append(nm,tx,chs);box.append(face(),col,more);stage.append(box);
let queue=[],cb=null,full='',typed=0,timer=null,choosing=false,cur=null;
function show(n){cur=n;full=n.t;typed=0;tx.textContent='';chs.replaceChildren();more.hidden=true;choosing=false;clearInterval(timer);
  timer=setInterval(()=>{typed+=2;tx.textContent=full.slice(0,typed);if(typed>=full.length){clearInterval(timer);endType();}},28);}
function endType(){tx.textContent=full;typed=full.length;
  if(cur.c){choosing=true;cur.c.forEach(o=>{const b=el('button','',o.l);b.type='button';
      b.addEventListener('click',e=>{e.stopPropagation();queue=[...o.then,...queue];next();});chs.append(b);});
    chs.firstChild.focus({preventScroll:true});}
  else more.hidden=false;}
function advance(){if(choosing)return;if(typed<full.length){clearInterval(timer);endType();return;}next();}
function next(){const n=queue.shift();if(!n){box.hidden=true;busy=false;const c=cb;cb=null;c&&c();return;}show(n);}
function run(lines,then){busy=true;queue=[...lines];cb=then||null;box.hidden=false;next();}
box.addEventListener('click',advance);
addEventListener('keydown',e=>{if(box.hidden||termOpen)return;if(e.key==='Enter'||e.key===' '){if(choosing)return;e.preventDefault();advance();}});

const INTRO=[
 {t:"Ah, te voilà ! L'intranet est tombé depuis 8 h et les commerciaux me harcèlent."},
 {t:"C'est srv-web01, une Debian avec Apache. Je t'ouvre une session SSH dessus."},
 {t:"Tu veux un indice avant de te lancer ?",c:[
   {l:"Oui, un indice",then:[{t:"Commence toujours par l'état du service. Le message d'erreur dit souvent tout."}]},
   {l:"Non, je gère",then:[{t:"J'aime cette confiance. Tape « aide » si tu bloques."}]}]}];
const OUTRO=[
 {t:"Un /var plein à cause d'un log de debug de 18 Go… grand classique !"},
 {t:"Bon réflexe d'avoir lu le statut avant de redémarrer au hasard. Mission validée : +150 XP."}];

/* Terminal */
const tm=el('div','tm');tm.hidden=true;
const win=el('div','tm-win');win.setAttribute('role','dialog');win.setAttribute('aria-label','Terminal SSH srv-web01');
const head=el('div','tm-head');const dots=el('span','dots');['#ef6b5e','#f2b54a','#6fd08c'].forEach(c=>{const i=el('i');i.style.background=c;dots.append(i);});
head.append(dots,el('span','tm-title','hugo@srv-web01 — ssh'));
const objs=el('ul','tm-obj'),out=el('pre','tm-out'),line=el('div','tm-line'),PROMPT='hugo@srv-web01:~$';
const inp=el('input','tm-in');Object.assign(inp,{type:'text',id:'tm-in',autocomplete:'off',spellcheck:false});
inp.setAttribute('autocapitalize','off');inp.setAttribute('autocorrect','off');inp.setAttribute('aria-label','Commande');
line.append(el('span','',PROMPT),inp);
const foot=el('div','tm-foot');const bHelp=el('button','','Aide'),bQuit=el('button','','Quitter'),bEnd=el('button','primary','Fermer la session');
[bHelp,bQuit,bEnd].forEach(b=>b.type='button');bEnd.hidden=true;foot.append(bHelp,bQuit,bEnd);
win.append(head,objs,out,line,foot);tm.append(win);document.body.append(tm);

const NEED=[{k:'status',l:"Consulter l'état du service apache2"},{k:'df',l:"Vérifier l'espace disque"},{k:'rm',l:"Libérer de la place sur /var"},{k:'restart',l:"Relancer Apache"}];
const HINTS=["systemctl status apache2        état du service","df -h                           espace disque par partition","ls -lh /var/log                 taille des fichiers de logs","sudo rm <fichier>               supprimer un fichier (root)","sudo systemctl restart apache2  relancer le service","curl -I localhost               tester le site"];
const CMDS=[
 {re:/^(clear|cls)$/i,clear:1},{re:/^whoami$/i,out:'hugo'},{re:/^hostname$/i,out:'srv-web01'},{re:/^pwd$/i,out:'/home/hugo'},{re:/^ls(\s+-\w+)*$/i,out:'notes-astreinte.txt'},
 {re:/^cat\s+notes-astreinte\.txt$/i,out:"- Apache sur srv-web01\n- Logs dans /var/log\n- Toujours lire le statut avant de redémarrer"},
 {re:/^(sudo\s+)?systemctl\s+status\s+apache2(\.service)?$/i,k:'status',out:s=>s.has('restart')?
  "● apache2.service - The Apache HTTP Server\n     Loaded: loaded (/lib/systemd/system/apache2.service; enabled)\n     Active: active (running) since Tue 2026-11-03 09:31:44 CET; 4s ago\n   Main PID: 2210 (apache2)":
  "● apache2.service - The Apache HTTP Server\n     Loaded: loaded (/lib/systemd/system/apache2.service; enabled)\n     Active: failed (Result: exit-code) since Tue 2026-11-03 08:14:03 CET; 1h 12min ago\n\nnov. 03 08:14:03 srv-web01 apachectl[815]: (28)No space left on device:\n  AH00023: Couldn't create the proxy mutex\nnov. 03 08:14:03 srv-web01 systemd[1]: apache2.service: Failed with result 'exit-code'."},
 {re:/^(sudo\s+)?journalctl\b.*apache2/i,out:"nov. 03 08:14:03 srv-web01 apachectl[815]: (28)No space left on device\nnov. 03 08:14:03 srv-web01 systemd[1]: Failed to start apache2.service."},
 {re:/^df(\s+-\w+)*$/i,k:'df',out:s=>"Sys. de fichiers Taille Utilisé Dispo Uti% Monté sur\n/dev/sda1           20G    6,1G   13G  32% /\n/dev/sda3           20G    "+(s.has('rm')?"1,9G   18G  10%":" 20G     0 100%")+" /var\ntmpfs              988M       0  988M   0% /dev/shm"},
 {re:/^(sudo\s+)?(ls|du)(\s+-\w+)*\s+\/var\/log(\/\*?)?\/?$/i,out:s=>(s.has('rm')?"":"-rw-r----- 1 root adm  18G nov.  3 08:13 debug.log\n")+"drwxr-x--- 2 root adm 4,0K nov.  3 07:00 apache2\n-rw-r----- 1 root adm 1,2M nov.  3 09:20 syslog\n-rw-r----- 1 root adm 310K nov.  3 09:20 auth.log"},
 {re:/^cd\s+\/var\/log\/?$/i,out:''},
 {re:/^sudo\s+(rm(\s+-\w+)*|truncate\s+-s\s*0)\s+(\/var\/log\/)?debug\.log$/i,k:'rm',out:"# rm ne dit rien quand tout va bien : 18 Go libérés"},
 {re:/^(rm(\s+-\w+)*|truncate\s+-s\s*0)\s+(\/var\/log\/)?debug\.log$/i,out:"rm: impossible de supprimer '/var/log/debug.log': Permission non accordée"},
 {re:/^sudo\s+systemctl\s+(re)?start\s+apache2(\.service)?$/i,k:'restart',req:'rm',fail:'Job for apache2.service failed because the control process exited with error code.\nSee "systemctl status apache2.service" for details.',out:''},
 {re:/^systemctl\s+(re)?start\s+apache2/i,out:"Failed to restart apache2.service: Interactive authentication required."},
 {re:/^curl(\s+-\w+)*\s+(http:\/\/)?localhost\/?$/i,out:s=>s.has('restart')?"HTTP/1.1 200 OK\nServer: Apache/2.4.62 (Debian)\nContent-Type: text/html; charset=UTF-8":"curl: (7) Failed to connect to localhost port 80: Connection refused"}];
let got=new Set(),hist=[],hi=0,solved=false;
const print=s=>{if(s==null||s==='')return;out.textContent+=s+'\n';out.scrollTop=out.scrollHeight;};
const drawObjs=()=>objs.replaceChildren(...NEED.map(o=>{const li=el('li',got.has(o.k)?'ok':'',o.l);return li;}));
const help=()=>print('Commandes utiles :\n'+HINTS.map(h=>'  '+h).join('\n'));
function exec(raw){const c=raw.trim().replace(/\s+/g,' ');print(PROMPT+' '+raw);if(!c)return;hist.push(c);hi=hist.length;
  if(/^(aide|help|\?)$/i.test(c))return help();
  if(/^(exit|logout)$/i.test(c))return close(solved);
  const e=CMDS.find(x=>x.re.test(c));
  if(!e)return print(`bash: ${c.split(' ')[0]} : commande introuvable`);
  if(e.clear){out.textContent='';return;}
  if(e.req&&!got.has(e.req))return print(e.fail);
  print(typeof e.out==='function'?e.out(got):e.out);
  if(e.k&&!got.has(e.k)){got.add(e.k);drawObjs();}
  if(!solved&&NEED.every(o=>got.has(o.k))){solved=true;print('\n✔ Apache tourne, l’intranet répond. Tape « exit » ou ferme la session.');bEnd.hidden=false;bQuit.hidden=true;}}
inp.addEventListener('keydown',e=>{
  if(e.key==='Enter'){exec(inp.value);inp.value='';}
  else if(e.key==='ArrowUp'&&hist.length){hi=Math.max(0,hi-1);inp.value=hist[hi];e.preventDefault();}
  else if(e.key==='ArrowDown'){hi=Math.min(hist.length,hi+1);inp.value=hist[hi]||'';e.preventDefault();}
  else if(e.key==='Escape')close(solved);
  e.stopPropagation();});
win.addEventListener('click',e=>{if(e.target===out||e.target.closest('button'))return;inp.focus();});
bHelp.addEventListener('click',()=>{print(PROMPT+' aide');help();inp.focus();});
bQuit.addEventListener('click',()=>close(false));bEnd.addEventListener('click',()=>close(true));
function openTerm(){termOpen=true;busy=true;got=new Set();solved=false;hist=[];bEnd.hidden=true;bQuit.hidden=false;
  out.textContent="Linux srv-web01 6.1.0-26-amd64 #1 SMP Debian 6.1.112-1 x86_64\nDernière connexion : mar. 3 nov. 08:02 depuis 192.168.1.23\nTape « aide » pour voir les commandes utiles.\n\n";
  drawObjs();tm.hidden=false;setTimeout(()=>inp.focus(),40);}
function close(win){tm.hidden=true;termOpen=false;busy=false;
  if(win)run(OUTRO,()=>{done=true;onDone();});
  else run([{t:"Pas de souci, reviens quand tu veux. Le serveur ne va pas se réparer tout seul, par contre !"}]);}

function talk(){if(busy)return;
  if(done)return run([{t:"L'intranet tourne nickel. Pense à configurer logrotate pour que ça ne se reproduise pas !"}]);
  run(INTRO,openTerm);}
return{talk,busy:()=>busy,isDone:()=>done,onDone:f=>{onDone=f;}};
})();
