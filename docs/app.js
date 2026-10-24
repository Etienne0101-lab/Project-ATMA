const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const callbacks=[
 {id:1,host:"LAB-WIN01",user:"lab\\operator",os:"Windows 11",ip:"10.10.0.21",agent:"apollo",c2:"http",status:"live",last:"12s ago",desc:"Windows C# agent — demo record"},
 {id:2,host:"LAB-MAC02",user:"labuser",os:"macOS 14",ip:"10.10.0.34",agent:"apfell",c2:"http",status:"live",last:"41s ago",desc:"macOS JXA agent — demo record"},
 {id:3,host:"LAB-LIN03",user:"root",os:"Ubuntu 24.04",ip:"10.10.0.47",agent:"poseidon",c2:"websocket",status:"live",last:"8s ago",desc:"Go agent, Linux/macOS — demo record"},
 {id:4,host:"LAB-WIN04",user:"svc_test",os:"Windows Server 2022",ip:"10.10.0.58",agent:"athena",c2:"http",status:"idle",last:"6m ago",desc:".NET agent, beta proxy support — demo record"},
 {id:5,host:"LAB-LIN05",user:"analyst",os:"Debian 12",ip:"10.10.0.63",agent:"medusa",c2:"http",status:"dead",last:"2h ago",desc:"Python agent — demo record"},
];
let selected=callbacks[0];
let tasks={1:[{cmd:"whoami",out:"lab\\operator (simulated)"},{cmd:"pwd",out:"C:\\Users\\operator\\Desktop (simulated)"}],2:[],3:[],4:[],5:[]};
const simOutput=(cb,cmd)=>{
 const c=cmd.trim().toLowerCase();
 if(c==="help") return "Demo commands: whoami, pwd, ls, ps, shell <text>, download <file>, screenshot, link, exit. All output is simulated.";
 if(c==="whoami") return cb.user+" (simulated)";
 if(c==="pwd") return cb.os.includes("Windows")?"C:\\Users\\operator (simulated)":"/home/"+cb.user.split("\\").pop()+" (simulated)";
 if(c==="ls") return cb.os.includes("Windows")?"Desktop  Documents  Downloads  (simulated)":"Desktop  Documents  Downloads  (simulated)";
 if(c==="ps") return "PID  NAME\n  412  explorer.exe (simulated)\n  918  apollo.exe (simulated — demo record, not a real process)";
 if(c==="screenshot") return "[Simulated screenshot placeholder — no image is captured. A real Mythic agent would return a file download.]";
 if(c.startsWith("shell ")) return "Simulated shell output for: "+esc(cmd.slice(6))+" — no command was executed on any host.";
 if(c.startsWith("download ")) return "Simulated download request queued for "+esc(cmd.slice(9))+" — no file was transferred.";
 if(c==="exit"||c==="link") return "Simulated: "+c+" acknowledged in demo mode only.";
 return "Unknown demo command. Type: help";
};
const agents=[
 {name:"apollo",os:"Windows",lang:"C#",c2:["http","smb","tcp","websocket"],note:"Windows-focused, process migration and assembly execution in a real deployment."},
 {name:"apfell",os:"macOS",lang:"JavaScript for Automation (JXA)",c2:["http","dynamichttp"],note:"macOS agent using JXA."},
 {name:"athena",os:"Windows",lang:".NET",c2:["http","websocket"],note:".NET agent, with beta proxy support reported in community guides."},
 {name:"medusa",os:"Windows / Linux / macOS",lang:"Python",c2:["http"],note:"Cross-platform Python agent; can run arbitrary Python in a real deployment."},
 {name:"poseidon",os:"Linux / macOS",lang:"Go",c2:["http","tcp","websocket"],note:"Go agent with Linux/macOS features such as launchd persistence in a real deployment."},
];
const c2profiles=[
 {name:"http",desc:"Standard HTTP(S) callback channel. The most common direct-egress profile.",p2p:false},
 {name:"dynamichttp",desc:"HTTP profile with dynamic / configurable parameters.",p2p:false},
 {name:"smb",desc:"Peer-to-peer SMB channel for linking agents inside a network.",p2p:true},
 {name:"tcp",desc:"Peer-to-peer TCP channel (Poseidon and others).",p2p:true},
 {name:"websocket",desc:"WebSocket callback channel.",p2p:false},
];
function viewDashboard(){
 return `<h1>Mythic, at a glance</h1><p class="muted">A cross-platform, post-exploitation red-team framework built with Go, Docker, and a browser UI. Mythic itself is controlled with <code>mythic-cli</code> and runs as Docker containers — it does <b>not</b> run on GitHub Pages. This app is the front-end console, demo data, and assistant for it.</p>
 <div class="grid">
  <div class="card stat"><b>${callbacks.filter(c=>c.status==="live").length}</b><span>Live demo callbacks</span></div>
  <div class="card stat"><b>${callbacks.length}</b><span>Total demo callbacks</span></div>
  <div class="card stat"><b>${agents.length}</b><span>Payload types shown</span></div>
  <div class="card stat"><b>${c2profiles.length}</b><span>C2 profiles shown</span></div>
 </div>
 <div class="card"><h2>How Mythic fits together</h2><p><b>Operator UI → Mythic server (Go + Postgres + RabbitMQ, in Docker) → C2 profile → agent/payload on a host → callback → tasks and output.</b> Payload types and C2 profiles are installed separately into a real instance, e.g. <code>./mythic-cli install github https://github.com/MythicAgents/apfell</code> and <code>./mythic-cli install github https://github.com/MythicC2Profiles/http</code>. The Mythic repo itself hosts no payload types or C2 profiles.</p>
 <p class="muted">Use this console only against systems you own or are explicitly authorised to test. Demo callbacks here are fictional lab records — nothing here connects to, scans, or executes on a real host.</p></div>
 <div class="card"><h2>Latest briefing</h2><div id="briefBox" class="muted">Loading briefing…</div></div>`;
}
function viewCallbacks(){
 const rows=callbacks.map(c=>`<tr class="${c.id===selected.id?'sel':''}" onclick="selectCb(${c.id})"><td><b>${esc(c.host)}</b><br><span class="muted">${esc(c.desc)}</span></td><td>${esc(c.agent)}</td><td>${esc(c.c2)}</td><td>${esc(c.os)}</td><td>${esc(c.ip)}</td><td><span class="badge ${c.status==='live'?'live':c.status==='idle'?'':'dead'}">${c.status}</span> ${esc(c.last)}</td></tr>`).join("");
 const hist=(tasks[selected.id]||[]).map(t=>`<div><code>&gt; ${esc(t.cmd)}</code><pre>${t.out}</pre></div>`).join("")||`<p class="muted">No tasks yet for this demo callback.</p>`;
 return `<h1>Callbacks</h1><p class="muted">Select a callback, then issue a demo task. Output is simulated and labelled as such.</p>
 <div class="card"><table><tr><th>Host</th><th>Agent</th><th>C2</th><th>OS</th><th>IP (demo)</th><th>Status</th></tr>${rows}</table></div>
 <div class="card"><h2>${esc(selected.host)} — ${esc(selected.agent)} over ${esc(selected.c2)}</h2><p class="muted">${esc(selected.user)} · ${esc(selected.os)} · ${esc(selected.ip)} · Last check-in ${esc(selected.last)}</p>
 <div style="display:flex;gap:8px"><input class="field" id="taskInput" placeholder="Type a demo task, e.g. whoami" style="margin:0"><button class="btn" onclick="issueTask()">Issue task</button></div>
 <div style="margin-top:12px">${hist}</div></div>`;
}
function viewPayloads(){
 const opts=agents.map(a=>`<option value="${a.name}">${a.name} — ${a.os}</option>`).join("");
 return `<h1>Payload Builder — configuration only</h1><p class="muted">This builder produces a <b>configuration summary and the install commands for your own Mythic instance</b>. It does not compile, download, or deliver a real payload/agent binary.</p>
 <div class="card"><label>Payload type</label><select class="field" id="pbAgent">${opts}</select>
 <label>Operating system</label><select class="field" id="pbOs"><option>Windows</option><option>macOS</option><option>Linux</option></select>
 <label>C2 profile</label><select class="field" id="pbC2"><option>http</option><option>dynamichttp</option><option>smb</option><option>tcp</option><option>websocket</option></select>
 <label>Callback host (your lab server, for the config summary only)</label><input class="field" id="pbHost" placeholder="e.g. 10.10.0.10 — do not use a target you are not authorised to test">
 <label>Callback interval (seconds)</label><input class="field" id="pbInt" type="number" value="10">
 <button class="btn" onclick="buildPayload()">Generate configuration summary</button>
 <div id="pbOut" style="margin-top:12px"></div></div>
 <div class="card"><h2>Payload types in this console</h2>${agents.map(a=>`<p><b>${a.name}</b> — ${a.os} · ${a.lang} · C2: ${a.c2.join(", ")}<br><span class="muted">${a.note}</span></p>`).join("")}</div>`;
}
function viewC2(){
 return `<h1>C2 Profiles</h1><p class="muted">A C2 profile is the channel an agent uses to check in. Direct profiles talk to the Mythic server; peer-to-peer (P2P) profiles link agents together inside a network so only one needs egress.</p>
 <div class="card">${c2profiles.map(p=>`<p><b>${p.name}</b> ${p.p2p?'<span class="badge">P2P / linked</span>':'<span class="badge">Direct</span>'}<br><span class="muted">${p.desc}</span></p>`).join("")}</div>
 <div class="card"><h2>Install into your own Mythic instance</h2><pre>sudo ./mythic-cli install github https://github.com/MythicC2Profiles/http
sudo ./mythic-cli start</pre><p class="muted">Full setup, screenshots, and examples are in the official Mythic documentation.</p></div>`;
}
function viewDocs(){
 return `<h1>Mythic Guide</h1>
 <div class="card"><h2>Start a real Mythic instance (on your own machine, not on Pages)</h2><pre>sudo make          # builds mythic-cli, from the Mythic repo root
sudo ./mythic-cli start
# then open the Mythic web UI on your host and install agents / C2 profiles</pre></div>
 <div class="card"><h2>Core concepts</h2><p><b>Callback:</b> a registered agent session on a host. <b>Task:</b> a command issued to a callback; output returns as a task result. <b>Payload type:</b> an agent implementation (apollo, apfell, poseidon…). <b>C2 profile:</b> the transport (http, smb, tcp, websocket…). <b>Operation:</b> Mythic groups callbacks/tasks for reporting and collaboration.</p>
 <p><b>Files / downloads:</b> in real Mythic, agent output files land in the server file browser. This demo does not transfer files.</p></div>
 <div class="card"><h2>Security model of this Pages app</h2><p>GitHub Pages serves static files only — there is no server to hide a key in. So: (1) the repo secret <code>PROJECT_ATMA</code> is <b>never</b> put in this JavaScript bundle; (2) it is used only inside GitHub Actions, where the runner can read it and the log never prints it, to refresh <code>docs/ai-briefing.json</code>; (3) live chat from your browser uses a Groq key <b>you</b> paste in Connect, stored only in your browser's localStorage. Remove it any time from Connect.</p></div>`;
}
function viewConnect(){
 const hasKey=!!localStorage.getItem("atma_groq_key");
 const model=localStorage.getItem("atma_groq_model")||"llama-3.3-70b-versatile";
 const mUrl=localStorage.getItem("atma_mythic_url")||"";
 return `<h1>Connect / AI Keys</h1>
 <div class="card"><h2>AI assistant — Groq (browser key, local only)</h2><p class="muted">Status: <b>${hasKey?"Key saved in this browser":"No key saved — demo mode"}</b>. A saved key is sent only from your browser to api.groq.com. It is never committed to the repo and never sent to GitHub Pages.</p>
 <label>Groq API key</label><input class="field" id="groqKey" type="password" placeholder="${hasKey?"Key saved — paste a new one to replace it":"Paste your Groq key here"}">
 <label>Model</label><input class="field" id="groqModel" value="${esc(model)}">
 <button class="btn" onclick="saveGroq()">Save key in this browser</button> <button class="btn2" onclick="clearGroq()">Remove saved key</button></div>
 <div class="card"><h2>Mythic server (optional, demo only here)</h2><p class="muted">Static Pages cannot safely proxy a Mythic server, and this build does not connect to one. If you run your own Mythic instance, keep its URL/token in this browser only and use its own UI for real operations.</p>
 <label>Mythic URL (local only)</label><input class="field" id="mythicUrl" value="${esc(mUrl)}" placeholder="https://your-mythic-host:7443">
 <button class="btn2" onclick="saveMythic()">Save URL locally</button></div>
 <div class="card"><h2>Repo secret — PROJECT_ATMA</h2><p>This secret is <b>not</b> readable from the browser and is <b>not</b> in this app. Its only use in this repo is the GitHub Actions workflow (copy <code>github-workflows/groq-briefing.yml</code> to <code>.github/workflows/groq-briefing.yml</code> — GitHub Apps cannot create workflow files directly, so that one step is manual). That workflow runs on demand, reads <code>secrets.PROJECT_ATMA</code> as the Groq key inside the runner, asks Groq for a short public Mythic briefing, and commits only the resulting <code>docs/ai-briefing.json</code>. The key itself is never printed or committed.</p></div>`;
}

const views={dashboard:viewDashboard,callbacks:viewCallbacks,payloads:viewPayloads,c2:viewC2,docs:viewDocs,connect:viewConnect};
let current="dashboard";
function render(){
 $("#main").innerHTML=views[current]();
 document.querySelectorAll("nav button[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===current));
 if(current==="dashboard") loadBriefing();
 updateAiPill();
}
function loadBriefing(){
 fetch("ai-briefing.json").then(r=>r.json()).then(j=>{
  const el=$("#briefBox"); if(!el) return;
  el.innerHTML=`<p>${esc(j.briefing||"")}</p><p class="muted">Source: ${esc(j.source||"starter")} · Updated: ${esc(j.updated||"")}</p>`;
  $("#briefPill").textContent="Briefing: "+(j.source||"starter");
 }).catch(()=>{const el=$("#briefBox"); if(el) el.textContent="Starter briefing not loaded — the workflow briefing will appear here after its first run.";});
}
function updateAiPill(){
 const has=!!localStorage.getItem("atma_groq_key");
 $("#aiPill").textContent=has?"AI: Groq (browser key)":"AI: Offline demo";
}
window.selectCb=id=>{selected=callbacks.find(c=>c.id===id); render();};
window.issueTask=()=>{
 const v=$("#taskInput").value.trim(); if(!v) return;
 (tasks[selected.id]=tasks[selected.id]||[]).push({cmd:v,out:simOutput(selected,v)});
 render();
};
window.buildPayload=()=>{
 const a=$("#pbAgent").value, os=$("#pbOs").value, c2=$("#pbC2").value, host=$("#pbHost").value||"YOUR-CALLBACK-HOST", interval=$("#pbInt").value||"10";
 const info=agents.find(x=>x.name===a);
 const summary={payload_type:a,os,c2_profile:c2,callback_host:host,callback_interval_seconds:Number(interval),note:"Configuration summary only — no payload was built, compiled, or delivered.",install_commands:[`sudo ./mythic-cli install github https://github.com/MythicAgents/${a}`,`sudo ./mythic-cli install github https://github.com/MythicC2Profiles/${c2}`]};
 $("#pbOut").innerHTML=`<p><b>${a}</b> — ${info.os} · ${info.lang}<br><span class="muted">${info.note}</span></p><pre>${esc(JSON.stringify(summary,null,2))}</pre><p class="muted">Run those install commands inside your own Mythic instance, then create the payload from its UI with the parameters above.</p>`;
};
window.saveGroq=()=>{const k=$("#groqKey").value.trim(); if(!k){alert("Paste a Groq key first.");return;} localStorage.setItem("atma_groq_key",k); localStorage.setItem("atma_groq_model",$("#groqModel").value.trim()||"llama-3.3-70b-versatile"); render(); addMsg("assistant","Groq key saved in this browser only. Ask me something and I will answer live via Groq.");};
window.clearGroq=()=>{localStorage.removeItem("atma_groq_key"); render(); addMsg("assistant","Saved Groq key removed. Back to offline demo mode.");};
window.saveMythic=()=>{localStorage.setItem("atma_mythic_url",$("#mythicUrl").value.trim()); alert("Saved locally in this browser only. This demo build does not connect to a Mythic server.");};
document.querySelectorAll("nav button[data-view]").forEach(b=>b.addEventListener("click",()=>{current=b.dataset.view; render();}));
function addMsg(who,text){
 const d=document.createElement("div"); d.className="msg"+(who==="you"?" me":"");
 d.innerHTML=`<div class="who">${who==="you"?"You":"ATMA Assistant"}</div><div>${esc(text).replace(/\n/g,"<br>")}</div>`;
 $("#chat").appendChild(d); $("#chat").scrollTop=$("#chat").scrollHeight;
}
function demoAnswer(q){
 q=q.toLowerCase();
 if(q.includes("callback")) return "In Mythic, a callback is a registered agent session on a host. Operators issue tasks to a callback (like whoami or ls in this demo) and results come back as task output. Callbacks check in on an interval with jitter over their C2 profile.";
 if(q.includes("payload")||q.includes("apollo")||q.includes("apfell")||q.includes("poseidon")||q.includes("athena")||q.includes("medusa")) return "Payload types are agent implementations installed separately into Mythic: apollo (Windows, C#), apfell (macOS, JXA), poseidon (Linux/macOS, Go), athena (Windows, .NET), medusa (cross-platform, Python). Use the Payload Builder tab for a configuration summary — this Pages app does not build real payloads.";
 if(q.includes("c2")||q.includes("http")||q.includes("smb")||q.includes("websocket")) return "C2 profiles are the transport: http/dynamichttp for direct egress, websocket for WebSocket callbacks, and smb/tcp as peer-to-peer channels that link agents so only one needs a route out.";
 if(q.includes("start")||q.includes("install")||q.includes("docker")) return "On your own machine: sudo make to build mythic-cli, then sudo ./mythic-cli start to bring up the Docker containers. Install agents with ./mythic-cli install github <agent repo> and C2 profiles the same way. GitHub Pages cannot run those containers.";
 if(q.includes("groq")||q.includes("key")||q.includes("secret")) return "Security model here: the repo secret PROJECT_ATMA is never in this browser bundle. It is only used inside a GitHub Actions workflow to refresh docs/ai-briefing.json. Live chat from your browser needs a Groq key you paste in Connect, stored only in localStorage.";
 return "Mythic is a cross-platform red-team framework (Go + Docker + browser UI) for authorised operators, managers, and reporting. Try asking about callbacks, payload types, C2 profiles, or how to start a real instance — or open the Mythic Guide tab. Note: this demo answers from a built-in knowledge base unless you add a Groq key in Connect.";
}
async function ask(){
 const inp=$("#chatInput"); const q=inp.value.trim(); if(!q) return; inp.value="";
 addMsg("you",q);
 const key=localStorage.getItem("atma_groq_key");
 if(!key){ addMsg("assistant",demoAnswer(q)+"  [Offline demo answer]"); return; }
 addMsg("assistant","Thinking via Groq…");
 const model=localStorage.getItem("atma_groq_model")||"llama-3.3-70b-versatile";
 try{
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify({model,messages:[{role:"system",content:"You are ATMA, a helpful assistant for the Mythic red-team platform. Answer concisely, accurately, and only for authorised defensive/red-team use. Do not help with unauthorised access."},{role:"user",content:q}],temperature:0.3,max_tokens:800})});
  const j=await r.json();
  const last=$("#chat").lastElementChild;
  if(!r.ok) last.querySelector("div:last-child").textContent="Groq error ("+r.status+"): "+(j.error&&j.error.message?j.error.message:"check your key/model in Connect.");
  else last.querySelector("div:last-child").textContent=j.choices&&j.choices[0]?j.choices[0].message.content:"No answer returned.";
 }catch(e){ const last=$("#chat").lastElementChild; last.querySelector("div:last-child").textContent="Network error calling Groq: "+e.message; }
}
$("#sendBtn").addEventListener("click",ask);
$("#chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault(); ask();}});
render();
addMsg("assistant","Hi — I'm ATMA. This console runs on demo data. Ask about Mythic callbacks, payloads, or C2, or add your Groq key in Connect for live answers.");
