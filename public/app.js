let token=localStorage.getItem('dc_token'),me,people=[],selected=null,socket;
const $=s=>document.querySelector(s);
const api=async(u,o={})=>{o.headers=o.headers||{};if(token)o.headers.Authorization='Bearer '+token;let r=await fetch(u,o),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Erro');return d};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const av=u=>u?.photo?`<div class="avatar" style="background-image:url('${esc(u.photo)}')"></div>`:`<div class="avatar">${esc((u?.displayName||'?')[0].toUpperCase())}</div>`;
function toast(x){$('#toast').textContent=x;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2500)}

for(let b of document.querySelectorAll('.tabs button'))b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');$('#login').classList.toggle('hide',b.dataset.t!=='login');$('#reg').classList.toggle('hide',b.dataset.t!=='reg')};

$('#login').onsubmit=async e=>{e.preventDefault();try{let d=await api('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('#lu').value,password:$('#lp').value})});token=d.token;localStorage.setItem('dc_token',token);start()}catch(e){toast(e.message)}};
$('#reg').onsubmit=async e=>{e.preventDefault();try{let d=await api('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:$('#rn').value,username:$('#ru').value,password:$('#rp').value,ageConfirmed:$('#age').checked})});token=d.token;localStorage.setItem('dc_token',token);start()}catch(e){toast(e.message)}};
$('#logout').onclick=()=>{localStorage.removeItem('dc_token');location.reload()};

for(let b of document.querySelectorAll('.nav'))b.onclick=()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.remove('on'));b.classList.add('on');document.querySelectorAll('.page').forEach(x=>x.classList.add('hide'));$('#'+b.dataset.p).classList.remove('hide');if(b.dataset.p==='people')loadPeople();if(b.dataset.p==='chat')loadPeople(true);if(b.dataset.p==='feed')loadFeed();if(b.dataset.p==='profile'){loadBlocks();renderMe()}};

async function start(){
  try{
    me=(await api('/api/me')).user;
    $('#auth').classList.add('hide');$('#app').classList.remove('hide');
    renderMe();loadFeed();loadPeople();loadBlocks();
    if(me.ageConfirmed !== true) showAgeGate();
    else connectSocket();
    socket.on('message:new',m=>{if(selected?.id===m.from)openChat(m.from);else toast('💬 Nova mensagem')});
    socket.on('connection:new',()=>{toast('💘 Nova conexão recebida!');loadPeople(true)});
    socket.on('user:blocked',()=>{if(selected){toast('Esta conversa foi bloqueada.');selected=null;$('#msg').classList.add('hide');$('#chatActions').classList.add('hide')}})
  }catch{localStorage.removeItem('dc_token');location.reload()}
}

function renderMe(){
  $('#me').innerHTML=`<div class="mini">${av(me)}<div><b>${esc(me.displayName)}</b><small>@${esc(me.username)}</small></div></div>`;
  const big=$('#big');if(big){big.outerHTML=me.photo?`<div id="big" class="big" style="background-image:url('${esc(me.photo)}')"></div>`:`<div id="big" class="big">${esc((me.displayName||'?')[0].toUpperCase())}</div>`}
  $('#pn').value=me.displayName;$('#pb').value=me.bio||'';
  $('#privacyProfile').value=me.privacy?.profileVisibility||'public';
  $('#privacyMessages').value=me.privacy?.allowMessages||'connections';
}

async function loadPeople(chat=false){
  try{
    people=(await api('/api/people')).users;
    $('#peopleList').innerHTML=people.map(p=>`<div class="person">${av(p)}<div class="info"><h3>${esc(p.displayName)}</h3><p>@${esc(p.username)}${p.bio?' · '+esc(p.bio):''}</p></div><button onclick="connectUser('${p.id}')">♡</button><button onclick="openChat('${p.id}')">💬</button></div>`).join('')||'<p class="muted">Nenhuma outra pessoa disponível.</p>';
    if(chat)renderChatPeople();
  }catch(e){toast(e.message)}
}
window.connectUser=async id=>{try{await api('/api/connections/'+id,{method:'POST'});toast('Conexão criada!');loadPeople(true)}catch(e){toast(e.message)}};

function renderChatPeople(){$('#chatPeople').innerHTML=people.map(p=>`<button class="chatPerson" onclick="openChat('${p.id}')">${av(p)}<span>${esc(p.displayName)}</span></button>`).join('')||'<p class="muted" style="padding:12px">Nenhuma pessoa disponível.</p>'}

window.openChat=async id=>{
  selected=people.find(p=>p.id===id);if(!selected)return;
  document.querySelectorAll('.page').forEach(x=>x.classList.add('hide'));$('#chat').classList.remove('hide');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('on',x.dataset.p==='chat'));
  $('#chatTitle').textContent=' · '+selected.displayName;
  try{
    const safety=await api('/api/safety/status/'+id);
    $('#msg').classList.toggle('hide',!safety.canMessage);
    $('#chatActions').classList.remove('hide');
    $('#blockBtn').textContent=safety.blocked?'🔓 Desbloquear':'🚫 Bloquear';
    renderChatPeople();
    renderMsgs((await api('/api/messages/'+id)).messages);
  }catch(e){$('#msg').classList.add('hide');$('#chatActions').classList.remove('hide');$('#blockBtn').textContent='🚫 Bloquear';$('#msgs').innerHTML=`<p class="muted">${esc(e.message)}</p>`;renderChatPeople()}
};

function renderMsgs(ms){
  $('#msgs').innerHTML=ms.map(m=>`<div class="bubbleRow ${m.from===me.id?'me':''}"><div class="bubble">${m.text?esc(m.text):''}${m.image?`<img src="${esc(m.image)}" alt="Imagem enviada no chat">`:''}<small>${new Date(m.createdAt).toLocaleString('pt-BR')}</small></div></div>`).join('')||'<p>Nenhuma mensagem.</p>';
  $('#msgs').scrollTop=$('#msgs').scrollHeight
}

$('#miFile').onchange=()=>{$('#fileName').textContent=$('#miFile').files[0]?.name||''};

$('#msg').onsubmit=async e=>{
  e.preventDefault();if(!selected)return;
  let text=$('#mi').value.trim(),file=$('#miFile').files[0];
  if(!text&&!file)return;
  try{
    let fd=new FormData();fd.append('text',text);if(file)fd.append('image',file);
    await api('/api/messages/'+selected.id,{method:'POST',body:fd});
    $('#mi').value='';$('#miFile').value='';$('#fileName').textContent='';
    renderMsgs((await api('/api/messages/'+selected.id)).messages)
  }catch(e){toast(e.message)}
};

$('#blockBtn').onclick=async()=>{
  if(!selected)return;
  try{
    const safety=await api('/api/safety/status/'+selected.id);
    if(safety.blocked){await api('/api/blocks/'+selected.id,{method:'DELETE'});toast('Pessoa desbloqueada.')}
    else{if(!confirm('Bloquear esta pessoa? Ela não poderá enviar mensagens para você.'))return;await api('/api/blocks/'+selected.id,{method:'POST'});toast('Pessoa bloqueada.');}
    await loadPeople(true);loadBlocks();selected=null;$('#msg').classList.add('hide');$('#chatActions').classList.add('hide');$('#chatTitle').textContent='';$('#msgs').innerHTML='Escolha uma pessoa.';
  }catch(e){toast(e.message)}
};

$('#reportBtn').onclick=async()=>{
  if(!selected)return;
  const reason=prompt('Motivo da denúncia (ex.: assédio, golpe, conteúdo impróprio, perfil falso):');
  if(!reason)return;
  const details=prompt('Detalhes adicionais (opcional):')||'';
  try{await api('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetUserId:selected.id,reason,details})});toast('Denúncia registrada. Obrigado.')}catch(e){toast(e.message)}
};

async function loadFeed(){try{let d=await api('/api/posts');$('#feedList').innerHTML=d.posts.map(p=>`<article class="card post"><div class="postHead">${av(p.user)}<div><h3>${esc(p.user?.displayName||'Usuário')}</h3><small>${new Date(p.createdAt).toLocaleString('pt-BR')}</small></div></div>${p.text?`<p>${esc(p.text)}</p>`:''}${p.photo?`<img src="${esc(p.photo)}" alt="Imagem da publicação">`:''}</article>`).join('')||'<p class="muted">O mural está vazio.</p>'}catch(e){toast(e.message)}}
$('#post').onsubmit=async e=>{e.preventDefault();let fd=new FormData();fd.append('text',$('#pt').value);if($('#pf').files[0])fd.append('photo',$('#pf').files[0]);try{await api('/api/posts',{method:'POST',body:fd});$('#pt').value='';$('#pf').value='';loadFeed();toast('Publicado!')}catch(e){toast(e.message)}};

$('#save').onclick=async()=>{
  try{
    me=(await api('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:$('#pn').value,bio:$('#pb').value})})).user;
    if($('#photo').files[0]){let fd=new FormData();fd.append('photo',$('#photo').files[0]);me=(await api('/api/profile/photo',{method:'POST',body:fd})).user;$('#photo').value=''}
    renderMe();toast('Perfil salvo!')
  }catch(e){toast(e.message)}
};

$('#savePrivacy').onclick=async()=>{
  try{
    me=(await api('/api/privacy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({profileVisibility:$('#privacyProfile').value,allowMessages:$('#privacyMessages').value})})).user;
    renderMe();loadPeople();toast('Privacidade atualizada!')
  }catch(e){toast(e.message)}
};

async function loadBlocks(){
  try{
    const d=await api('/api/blocks');
    $('#blockedList').innerHTML=d.users.map(u=>`<div class="blockedUser">${av(u)}<span>${esc(u.displayName)}</span><button onclick="unblockUser('${u.id}')">Desbloquear</button></div>`).join('')||'<span class="muted">Nenhuma pessoa bloqueada.</span>';
  }catch(e){toast(e.message)}
}
window.unblockUser=async id=>{try{await api('/api/blocks/'+id,{method:'DELETE'});toast('Pessoa desbloqueada.');loadBlocks();loadPeople();}catch(e){toast(e.message)}};

function connectSocket(){
  if(socket) return;
  socket=io({auth:{token}});
  socket.on('message:new',m=>{if(selected?.id===m.from)openChat(m.from);else toast('💬 Nova mensagem')});
  socket.on('connection:new',()=>{toast('💘 Nova conexão recebida!');loadPeople(true)});
  socket.on('user:blocked',()=>{if(selected){toast('Esta conversa foi bloqueada.');selected=null;$('#msg').classList.add('hide');$('#chatActions').classList.add('hide')}})
}
function showAgeGate(){$('#ageGate').classList.remove('hide')}
$('#confirmAge').onclick=async()=>{
  if(!$('#existingAge').checked){toast('É necessário confirmar que você tem 18 anos ou mais.');return}
  try{
    me=(await api('/api/age-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})})).user;
    $('#ageGate').classList.add('hide');connectSocket();toast('Confirmação registrada.')
  }catch(e){toast(e.message)}
};
$('#cancelAge').onclick=()=>{localStorage.removeItem('dc_token');location.reload()};

let ownerToken=localStorage.getItem('dc_owner_token');
$('#ownerOpen').onclick=()=>{$('#auth').classList.add('hide');$('#ownerPanel').classList.remove('hide')};
$('#ownerClose').onclick=()=>{$('#ownerPanel').classList.add('hide');$('#auth').classList.remove('hide')};
$('#ownerLogin').onclick=async()=>{
  try{
    const d=await api('/api/owner/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('#ou').value,password:$('#op').value})});
    ownerToken=d.token;localStorage.setItem('dc_owner_token',ownerToken);$('#ownerLoginBox').classList.add('hide');$('#ownerDash').classList.remove('hide');loadOwnerReports();
  }catch(e){toast(e.message)}
};
async function ownerApi(u,o={}){
  o.headers=o.headers||{};if(ownerToken)o.headers.Authorization='Bearer '+ownerToken;
  const r=await fetch(u,o),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Erro');return d;
}
async function loadOwnerReports(){
  try{
    const d=await ownerApi('/api/owner/reports');
    $('#ownerReports').innerHTML=d.reports.map(r=>`<div class="reportCard">
      <b>${esc(r.reported?.displayName||'Usuário removido')}</b>
      <p>Denunciante: ${esc(r.reporter?.displayName||'Usuário')}<br>Motivo: ${esc(r.reason)}<br>${new Date(r.createdAt).toLocaleString('pt-BR')}</p>
      ${r.reported?`<div class="reportActions"><button onclick="ownerBlock('${r.reported.id}')">Bloquear por 7 dias</button><button class="danger" onclick="ownerDelete('${r.reported.id}')">Apagar pessoa</button></div>`:''}
    </div>`).join('')||'<p>Nenhuma denúncia pendente.</p>';
  }catch(e){toast(e.message)}
}
window.ownerRefresh=()=>loadOwnerReports();
$('#ownerRefresh').onclick=()=>loadOwnerReports();
$('#ownerLogout').onclick=()=>{ownerToken=null;localStorage.removeItem('dc_owner_token');$('#ownerDash').classList.add('hide');$('#ownerLoginBox').classList.remove('hide')};
window.ownerBlock=async id=>{if(!confirm('Bloquear esta conta por 7 dias?'))return;try{await ownerApi('/api/owner/users/'+id+'/block',{method:'POST'});toast('Conta bloqueada por 7 dias.');loadOwnerReports()}catch(e){toast(e.message)}};
window.ownerDelete=async id=>{if(!confirm('Apagar esta pessoa e seus dados do app?'))return;try{await ownerApi('/api/owner/users/'+id+'/delete',{method:'POST'});toast('Pessoa apagada.');loadOwnerReports()}catch(e){toast(e.message)}};

if(token)start();
