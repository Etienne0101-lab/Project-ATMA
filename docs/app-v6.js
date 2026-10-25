const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const callbacks=[
 {id:1,host:"LAB-WIN01",user:"lab\\operator",os:"Windows 11",ip:"10.10.0.21",agent:"apollo",c2:"http",status:"live",last:"12s ago",op:"ATMA Lab",desc:"Windows C# agent — demo record"},
 {id:2,host:"LAB-MAC02",user:"labuser",os:"macOS 14",ip:"10.10.0.34",agent:"apfell",c2:"http",status:"live",last:"41s ago",op:"ATMA Lab",desc:"macOS JXA agent — demo record"},
 {id:3,host:"LAB-LIN03",user:"root",os:"Ubuntu 24.04",ip:"10.10.0.47",agent:"poseidon",c2:"websocket",status:"live",last:"8s ago",op:"ATMA Lab",desc:"Go agent, Linux/macOS — demo record"},
 {id:4,host:"LAB-WIN04",user:"svc_test",os:"Windows Server 2022",ip:"10.10.0.58",agent:"athena",c2:"http",status:"idle",last:"6m ago",op:"ATMA Lab",desc:".NET agent, beta proxy support — demo record"},
 {id:5,host:"LAB-LIN05",user:"analyst",os:"Debian 12",ip:"10.10.0.63",agent:"medusa",c2:"http",status:"dead",last:"2h ago",op:"ATMA Lab",desc:"Python agent — demo record"},
];
let selected=callbacks[0];
let tasks={1:[{cmd:"whoami",out:"lab\\operator (simulated)",status:"completed"}],2:[],3:[],4:[],5:[]};
let cbFilter="";
const commands={
 apollo:["shell","ls","pwd","whoami","ps","download","upload","screenshot","sleep","exit","link","socks","inject","execute_assembly"],
 apfell:["shell","ls","pwd","whoami","ps","download","upload","screenshot","sleep","exit"],
 poseidon:["shell","ls","pwd","whoami","ps","download","upload","sleep","exit","link"],
 athena:["shell","ls","pwd","whoami","ps","download","upload","screenshot","sleep","exit","socks"],
 medusa:["shell","ls","pwd","whoami","ps","download","upload","sleep","exit","run_python"],
 merlin:["shell","ls","pwd","whoami","ps","download","upload","sleep","exit"],
 nemesis:["shell","ls","pwd","whoami","ps","download","upload","sleep","exit"],
 arachne:["shell","ls","pwd","whoami","ps","download","upload","sleep","exit"],
};
const simOutput=(cb,cmd)=>{
 const c=cmd.trim().toLowerCase();
 if(c==="help") return "Demo commands for "+cb.agent+": "+(commands[cb.agent]||commands.apollo).join(", ")+". All output is simulated. Task lifecycle in real Mythic: preprocessing → submitted → processing → processed → completed / error.";
 if(c==="whoami") return cb.user+" (simulated)";
 if(c==="pwd") return cb.os.includes("Windows")?"C:\\Users\\operator (simulated)":"/home/"+cb.user.split("\\").pop()+" (simulated)";
 if(c==="ls") return "Desktop  Documents  Downloads  (simulated)";
 if(c==="ps") return "PID  NAME\n  412  explorer.exe (simulated)\n  918  agent (simulated — demo record, not a real process)";
 if(c==="screenshot") return "[Simulated screenshot placeholder — no image is captured. A real Mythic agent would return a file download.]";
 if(c.startsWith("shell ")) return "Simulated shell output for: "+cmd.slice(6)+" — no command was executed on any host.";
 if(c.startsWith("download ")) return "Simulated download request queued for "+cmd.slice(9)+" — no file was transferred.";
 if(c.startsWith("run_python ")) return "Simulated Python output for: "+cmd.slice(11)+" — no code was executed.";
 if(c==="exit"||c==="link"||c==="socks") return "Simulated: "+c+" acknowledged in demo mode only.";
 return "Unknown demo command for "+cb.agent+". Type: help";
};
const agents=[
 {name:"apollo",os:"Windows",lang:"C#",c2:["http","smb","tcp","websocket"],note:"Windows-focused. In the ATMA native lab its service is installed but paused (see Live tab / README — a dependency decision is awaiting the operator)."},
 {name:"apfell",os:"macOS",lang:"JavaScript for Automation (JXA)",c2:["http","dynamichttp"],note:"macOS agent using JXA. Service runs natively on Linux; a built payload needs a macOS host to run."},
 {name:"athena",os:"Windows",lang:".NET",c2:["http","websocket"],note:".NET agent. In the ATMA native lab its service is installed but paused (same dependency decision as apollo)."},
 {name:"medusa",os:"Windows / Linux / macOS",lang:"Python",c2:["http"],note:"Cross-platform Python agent. Service + agent_code + builder running natively in the ATMA lab."},
 {name:"poseidon",os:"Linux / macOS",lang:"Go",c2:["http","tcp","websocket"],note:"Go agent. Service + agent_code + builder running natively in the ATMA lab; live callback + tasking proven 2026-10-24."},
 {name:"merlin",os:"Windows / Linux / macOS / BSD",lang:"Go",c2:["http","tcp","websocket","smb"],note:"Go agent (Merlin C2). Service + agent_code + builder running natively in the ATMA lab."},
 {name:"nemesis",os:"nemesis",lang:"Python",c2:["http"],note:"Python agent. Service running natively in the ATMA lab (its supported_os is reported as 'nemesis' by upstream)."},
 {name:"arachne",os:"Windows / Linux",lang:"Python",c2:["http","webshell"],note:"Python agent. Service running natively in the ATMA lab; also brought the webshell C2 profile."},
];
const c2profiles=[
 {name:"http",desc:"Standard HTTP(S) callback channel. The most common direct-egress profile.",p2p:false},
 {name:"dynamichttp",desc:"HTTP profile with dynamic / configurable parameters.",p2p:false},
 {name:"smb",desc:"Peer-to-peer SMB channel for linking agents inside a network.",p2p:true},
 {name:"tcp",desc:"Peer-to-peer TCP channel (Poseidon and others).",p2p:true},
 {name:"websocket",desc:"WebSocket callback channel.",p2p:false},
 {name:"httpx",desc:"HTTP profile with extra transform/egress options (Go service).",p2p:false},
 {name:"dns",desc:"DNS callback channel (Go service).",p2p:false},
 {name:"webshell",desc:"Webshell channel, brought in by the arachne agent service.",p2p:false},
];
const operations=[
 {name:"ATMA Lab",lead:"Stephen (demo)",members:[["Stephen","lead"],["operator-1","operator"],["auditor","spectator"]],blocklists:["spectator: no tasking, no payload creation, read-only"],alerts:"Demo operation — no Slack webhook configured in demo mode."},
];
const demoFiles=[
 {name:"screenshot_001.png",host:"LAB-WIN01",agent:"apollo",size:"142 KB",kind:"screenshot"},
 {name:"report.txt",host:"LAB-LIN03",agent:"poseidon",size:"3 KB",kind:"task output"},
 {name:"ls_output.txt",host:"LAB-MAC02",agent:"apfell",size:"1 KB",kind:"task output"},
];
function viewDashboard(){
 return `<h1>Mythic, at a glance</h1><p class="muted">A cross-platform, post-exploitation red-team framework built with Go, Docker, and a browser UI. Mythic itself is controlled with <code>mythic-cli</code> and runs as Docker containers — it does <b>not</b> run on GitHub Pages. This app is the front-end console, demo data, and assistant for it, and — when you point it at your own Mythic server in Connect — a client for that server.</p>
 <div class="grid">
  <div class="card stat"><b>${callbacks.filter(c=>c.status==="live").length}</b><span>Live demo callbacks</span></div>
  <div class="card stat"><b>${operations.length}</b><span>Demo operations</span></div>
  <div class="card stat"><b>${agents.length}</b><span>Payload types shown</span></div>
  <div class="card stat"><b>${demoFiles.length}</b><span>Demo files</span></div>
 </div>
 <div class="card"><h2>How Mythic fits together</h2><p><b>Operator UI → Mythic server (Go + Postgres + RabbitMQ, in Docker) → C2 profile → agent/payload on a host → callback → tasks and output.</b> Payload types and C2 profiles are installed separately into a real instance, e.g. <code>./mythic-cli install github https://github.com/MythicAgents/apfell</code> and <code>./mythic-cli install github https://github.com/MythicC2Profiles/http</code>. The Mythic repo itself hosts no payload types or C2 profiles.</p>
 <p class="muted">Use this console only against systems you own or are explicitly authorised to test. Demo callbacks here are fictional lab records — nothing here connects to, scans, or executes on a real host unless you configure your own Mythic server in Connect.</p></div>
 <div class="card"><h2>Deployment checklist</h2><p>✅ Pages site live (verified this session) · ✅ Console + demo data in repo · ✅ AI demo knowledge base · ⏳ Groq browser key (optional, Connect) · ⏳ Workflow copy for PROJECT_ATMA briefing (manual, see README) · ⏳ Your own Mythic server (Docker, on your host — required for real callbacks, not for this demo)</p></div>
 <div class="card"><h2>Latest briefing</h2><div id="briefBox" class="muted">Loading briefing…</div></div>`;
}
function viewCallbacks(){
 const list=callbacks.filter(c=>(c.host+c.agent+c.os+c.op).toLowerCase().includes(cbFilter.toLowerCase()));
 const rows=list.map(c=>`<tr class="${c.id===selected.id?'sel':''}" onclick="selectCb(${c.id})"><td><b>${esc(c.host)}</b><br><span class="muted">${esc(c.desc)}</span></td><td>${esc(c.agent)}</td><td>${esc(c.c2)}</td><td>${esc(c.os)}</td><td>${esc(c.ip)}</td><td><span class="badge ${c.status==='live'?'live':c.status==='idle'?'':'dead'}">${c.status}</span> ${esc(c.last)}</td></tr>`).join("")||`<tr><td colspan="6" class="muted">No callbacks match that filter.</td></tr>`;
 const cmds=(commands[selected.agent]||[]).map(c=>`<button class="btn2" onclick="pickCmd('${c}')">${c}</button>`).join(" ");
 const hist=(tasks[selected.id]||[]).map(t=>`<div><code>&gt; ${esc(t.cmd)}</code> <span class="badge live">${t.status||"completed"}</span><pre>${t.out}</pre></div>`).join("")||`<p class="muted">No tasks yet for this demo callback.</p>`;
 return `<h1>Callbacks</h1><p class="muted">Select a callback, pick a command, then issue a demo task. Real Mythic task lifecycle: preprocessing → submitted → processing → processed → completed / error. Here, output is simulated.</p>
 <div class="card"><input class="field" id="cbSearch" value="${esc(cbFilter)}" placeholder="Filter callbacks by host, agent, OS, or operation…" oninput="setFilter(this.value)"><table><tr><th>Host</th><th>Agent</th><th>C2</th><th>OS</th><th>IP (demo)</th><th>Status</th></tr>${rows}</table></div>
 <div class="card"><h2>${esc(selected.host)} — ${esc(selected.agent)} over ${esc(selected.c2)}</h2><p class="muted">${esc(selected.user)} · ${esc(selected.os)} · ${esc(selected.ip)} · Operation: ${esc(selected.op)} · Last check-in ${esc(selected.last)}</p>
 <p>${cmds}</p>
 <div style="display:flex;gap:8px"><input class="field" id="taskInput" placeholder="Type a demo task, e.g. whoami" style="margin:0"><button class="btn" onclick="issueTask()">Issue task</button></div>
 <div style="margin-top:12px">${hist}</div></div>`;
}
function viewOperations(){
 const op=operations[0];
 return `<h1>Operations</h1><p class="muted">Mythic groups callbacks, tasks, payloads, and files under an operation, with roles controlling who can do what.</p>
 <div class="card"><h2>${op.name}</h2><p>Lead: ${op.lead}</p><table><tr><th>Member</th><th>Role</th><th>What that means</th></tr>
 ${op.members.map(m=>`<tr><td>${esc(m[0])}</td><td>${esc(m[1])}</td><td>${m[1]==="lead"?"Full control of the operation":m[1]==="operator"?"Normal operator: create payloads, issue tasking": "Read-only: search and view, no tasking, no payload creation"}</td></tr>`).join("")}</table>
 <h3>Block lists</h3><p>${op.blocklists.join("<br>")}</p><p class="muted">Block lists are the middle ground between operator and spectator: named lists of commands an operator is not allowed to execute for a specific payload type.</p>
 <h3>Alerting</h3><p class="muted">${op.alerts} In real Mythic, an operation can set a Slack webhook; new callbacks from alert-able payloads trigger it, and individual payloads can be excluded.</p></div>`;
}
function viewPayloads(){
 const opts=agents.map(a=>`<option value="${a.name}">${a.name} — ${a.os}</option>`).join("");
 return `<h1>Payload Builder — configuration only</h1><p class="muted">This builder produces a <b>configuration summary and the install commands for your own Mythic instance</b>. It does not compile, download, or deliver a real payload/agent binary.</p>
 <div class="card"><label>Payload type</label><select class="field" id="pbAgent">${opts}</select>
 <label>Operating system</label><select class="field" id="pbOs"><option>Windows</option><option>macOS</option><option>Linux</option></select>
 <label>C2 profile</label><select class="field" id="pbC2"><option>http</option><option>dynamichttp</option><option>smb</option><option>tcp</option><option>websocket</option></select>
 <label>Callback host (your lab server, for the config summary only)</label><input class="field" id="pbHost" placeholder="e.g. 10.10.0.10 — do not use a target you are not authorised to test">
 <label>Callback interval (seconds)</label><input class="field" id="pbInt" type="number" value="10">
 <label>Commands to include</label><input class="field" id="pbCmds" placeholder="e.g. shell, ls, whoami (leave blank for the agent default set)">
 <button class="btn" onclick="buildPayload()">Generate configuration summary</button>
 <div id="pbOut" style="margin-top:12px"></div></div>
 <div class="card"><h2>Payload types in this console</h2>${agents.map(a=>`<p><b>${a.name}</b> — ${a.os} · ${a.lang} · C2: ${a.c2.join(", ")} · Commands: ${(commands[a.name]||[]).join(", ")}<br><span class="muted">${a.note}</span></p>`).join("")}<p class="muted">For the full, current list, use Catalog Import — it fetches the public MythicAgents and MythicC2Profiles org listings from GitHub.</p></div>`;
}
function viewC2(){
 return `<h1>C2 Profiles</h1><p class="muted">A C2 profile is the channel an agent uses to check in. Direct profiles talk to the Mythic server; peer-to-peer (P2P) profiles link agents together inside a network so only one needs egress.</p>
 <div class="card">${c2profiles.map(p=>`<p><b>${p.name}</b> ${p.p2p?'<span class="badge">P2P / linked</span>':'<span class="badge">Direct</span>'}<br><span class="muted">${p.desc}</span></p>`).join("")}</div>
 <div class="card"><h2>Install into your own Mythic instance</h2><pre>sudo ./mythic-cli install github https://github.com/MythicC2Profiles/http
sudo ./mythic-cli start</pre><p class="muted">Full setup, screenshots, and examples are in the official Mythic documentation.</p></div>`;
}
function viewFiles(){
 return `<h1>Files</h1><p class="muted">In real Mythic, files downloaded from callbacks, screenshots, and task output land in the file browser for the operation. Demo files below are placeholders — no file is transferred.</p>
 <div class="card"><table><tr><th>File</th><th>Host</th><th>Agent</th><th>Size</th><th>Kind</th></tr>${demoFiles.map(f=>`<tr><td>${esc(f.name)}</td><td>${esc(f.host)}</td><td>${esc(f.agent)}</td><td>${esc(f.size)}</td><td>${esc(f.kind)}</td></tr>`).join("")}</table></div>`;
}
function viewCatalog(){
 const saved=localStorage.getItem("atma_catalog");
 return `<h1>Catalog Import</h1><p class="muted">Import the public tool listings from GitHub — no key needed, unauthenticated GitHub API (60 requests/hour). This imports <b>metadata only</b> (repo name, description, link). It does not install, download, or run any agent or C2 profile.</p>
 <div class="card"><button class="btn" onclick="importCatalog()">Import from MythicAgents + MythicC2Profiles</button> <button class="btn2" onclick="clearCatalog()">Clear imported catalog</button><div id="catalogOut" style="margin-top:12px">${saved?`<p class="muted">Imported catalog saved in this browser. Click Import again to refresh.</p><pre>${esc(saved.slice(0,4000))}</pre>`:`<p class="muted">No imported catalog yet.</p>`}</div></div>
 <div class="card"><h2>Built-in catalog</h2><p><b>Agents:</b> ${agents.map(a=>a.name).join(", ")}<br><b>C2 profiles:</b> ${c2profiles.map(p=>p.name).join(", ")}</p><p class="muted">Install commands for any imported repo follow the same pattern: <code>./mythic-cli install github https://github.com/&lt;org&gt;/&lt;repo&gt;</code> — run inside your own Mythic instance, after reviewing the repo.</p></div>`;
}
function viewDocs(){
 return `<h1>Mythic Guide</h1>
 <div class="card"><h2>Start a real Mythic instance (on your own machine, not on Pages)</h2><pre>sudo make          # builds mythic-cli, from the Mythic repo root
sudo ./mythic-cli start
# then open the Mythic web UI on your host and install agents / C2 profiles
sudo ./mythic-cli update   # check for updates; it does not apply them for you</pre></div>
 <div class="card"><h2>Core concepts</h2><p><b>Callback:</b> a registered agent session on a host. <b>Task:</b> a command issued to a callback; output returns as a task result, through preprocessing → submitted → processing → processed → completed / error. <b>Payload type:</b> an agent implementation (apollo, apfell, poseidon…). <b>C2 profile:</b> the transport (http, smb, tcp, websocket…). <b>Operation:</b> Mythic groups callbacks/tasks for reporting and collaboration, with lead / operator / spectator roles and per-operator block lists. <b>Files:</b> downloads and screenshots from callbacks land in the operation file browser.</p></div>
 <div class="card"><h2>Connecting this console to your own Mythic server</h2><p>Pages is a different origin from your Mythic host, so a direct browser connection will usually be blocked by CORS or by Mythic's own auth. Practical, authorised options: (1) use this console in demo mode for planning and learning; (2) use Mythic's own UI on your Mythic host for real operations; (3) if you run a reverse proxy for your Mythic instance, point Connect at that proxy origin with your operator credentials stored only in this browser — the Test Connection button reports exactly what the browser sees (HTTP status, CORS block, or GraphQL error) instead of claiming success. This app never bypasses Mythic authentication and never contacts a Mythic server you have not configured.</p></div>
 <div class="card"><h2>Security model of this Pages app</h2><p>GitHub Pages serves static files only — there is no server to hide a key in. So: (1) the repo secret <code>PROJECT_ATMA</code> is <b>never</b> put in this JavaScript bundle; (2) it is used only inside GitHub Actions, where the runner can read it and the log never prints it, to refresh <code>docs/ai-briefing.json</code>; (3) live chat from your browser uses a Groq key <b>you</b> paste in Connect, stored only in your browser's localStorage. Remove it any time from Connect.</p></div>`;
}
function viewConnect(){
 const hasKey=!!localStorage.getItem("atma_groq_key");
 const model=localStorage.getItem("atma_groq_model")||"llama-3.3-70b-versatile";
 const mUrl=localStorage.getItem("atma_mythic_url")||"";
 const mPath=localStorage.getItem("atma_mythic_gql")||"/graphql";
 return `<h1>Connect / AI Keys</h1>
 <div class="card"><h2>AI assistant — Groq (browser key, local only)</h2><p class="muted">Status: <b>${hasKey?"Key saved in this browser":"No key saved — demo mode"}</b>. A saved key is sent only from your browser to api.groq.com. It is never committed to the repo and never sent to GitHub Pages.</p>
 <label>Groq API key</label><input class="field" id="groqKey" type="password" placeholder="${hasKey?"Key saved — paste a new one to replace it":"Paste your Groq key here"}">
 <label>Model</label><input class="field" id="groqModel" value="${esc(model)}">
 <button class="btn" onclick="saveGroq()">Save key in this browser</button> <button class="btn2" onclick="clearGroq()">Remove saved key</button></div>
 <div class="card"><h2>AI assistant — via your own host (Tailscale backend)</h2><p class="muted">Instead of a browser key, run <code>agent/atma-gateway.mjs</code> on your Linux host with <code>GROQ_API_KEY</code> in its environment, expose it with Tailscale Serve (e.g. <code>tailscale serve --bg --https=443 http://127.0.0.1:8787</code>), and paste that Serve HTTPS URL here. The chat then streams through your host — the Groq key stays on the host, never in this browser. Your phone must be on the same Tailscale network to reach the Serve name. Test with the gateway's <code>/gateway/status</code> endpoint.</p>
 <label>Gateway URL (Tailscale Serve HTTPS name, no trailing slash)</label><input class="field" id="gwUrl" value="${esc(localStorage.getItem("atma_gateway_url")||"")}" placeholder="https://your-host.tailnet-xxxx.ts.net">
 <button class="btn" onclick="saveGateway()">Save gateway URL locally</button> <button class="btn2" onclick="clearGateway()">Remove gateway URL</button><div id="gwTest" style="margin-top:10px"></div></div>
 <div class="card"><h2>Mythic server — client mode (your server, your credentials, local only)</h2><p class="muted">Demo mode is the default. To try a real connection, enter <b>your own</b> Mythic host, GraphQL path, and operator token. Nothing here is sent anywhere except to the URL you enter, from your browser. Test Connection reports the real result — it does not fake a connection.</p>
 <label>Mythic base URL</label><input class="field" id="mythicUrl" value="${esc(mUrl)}" placeholder="https://your-mythic-host:7443">
 <label>GraphQL path</label><input class="field" id="mythicGql" value="${esc(mPath)}">
 <label>Operator token / auth header value (local only)</label><input class="field" id="mythicToken" type="password" placeholder="Paste only if your Mythic setup uses a bearer token">
 <button class="btn" onclick="testMythic()">Test connection</button> <button class="btn2" onclick="saveMythic()">Save URL locally</button><div id="mythicTest" style="margin-top:10px"></div></div>
 <div class="card"><h2>Operational access scope — stated plainly</h2><p>Full scope <i>within this console</i> means: every view (dashboard, callbacks, operations, payloads, C2, files, catalog, guide) is present and functional in demo mode, the AI knows the full operational model, and the client can attempt a connection to a Mythic server you configure. It does <b>not</b> mean this public Pages site has access to any Mythic server, can log in as you, or can run operations on hosts you have not authorised. Real operational access lives in your own Mythic deployment, under its own operator accounts, roles, and block lists — this console is a client for it, not a replacement for its authentication.</p></div>
 <div class="card"><h2>Repo secret — PROJECT_ATMA</h2><p>This secret is <b>not</b> readable from the browser and is <b>not</b> in this app. Its only use in this repo is the GitHub Actions workflow (copy <code>github-workflows/groq-briefing.yml</code> to <code>.github/workflows/groq-briefing.yml</code> — GitHub Apps cannot create workflow files directly, so that one step is manual). That workflow runs on demand, reads <code>secrets.PROJECT_ATMA</code> as the Groq key inside the runner, asks Groq for a short public Mythic briefing, and commits only the resulting <code>docs/ai-briefing.json</code>. The key itself is never printed or committed.</p></div>`;
}


function viewLive(){
 const gw=localStorage.getItem("atma_gateway_url")||"";
 const hasGwTok=!!localStorage.getItem("atma_gateway_token");
 const hasJwt=!!localStorage.getItem("atma_mythic_jwt");
 return `<h1>Live Mythic — via your gateway</h1><p class="muted">This is the real-backend link, not demo data. The Pages app talks to <b>your gateway</b> (agent/atma-gateway.mjs on your host, Tailscale Serve), the gateway talks to <b>your Mythic server</b> (native systemd stack, lab/native/). The gateway checks its own token (x-atma-token); your Mythic operator token is forwarded through it and is <b>never stored by the gateway</b>. In this browser it is stored in localStorage only, like the Groq key, and you can remove it here.</p>
 <div class="card"><h2>Connect to your gateway</h2><p class="muted">Gateway status: <b>${gw?"URL saved":"No gateway URL — save one in Connect, or paste one here"}</b> · Gateway token: <b>${hasGwTok?"saved in this browser":"not saved"}</b> · Mythic operator token: <b>${hasJwt?"saved in this browser":"not saved"}</b></p>
 <label>Gateway URL (Tailscale Serve HTTPS name, no trailing slash)</label><input class="field" id="liveGw" value="${esc(gw)}" placeholder="https://your-host.tailnet-xxxx.ts.net">
 <label>Gateway token (ATMA_GATEWAY_TOKEN on the host)</label><input class="field" id="liveGwTok" type="password" placeholder="${hasGwTok?"Token saved — paste a new one to replace it":"Paste the gateway token"}">
 <label>Mythic operator username (for /mythic/auth via the gateway)</label><input class="field" id="liveUser" placeholder="e.g. mythic_admin">
 <label>Mythic operator password (sent only to your gateway, which forwards it to your Mythic server — never to GitHub Pages)</label><input class="field" id="livePass" type="password" placeholder="Operator password">
 <button class="btn" onclick="liveLogin()">Log in via gateway</button> <button class="btn2" onclick="liveLogout()">Remove saved tokens</button> <button class="btn2" onclick="liveRefresh()">Refresh live data</button><div id="liveOut" style="margin-top:10px"></div></div>
 <div class="card"><h2>Live data from your Mythic server</h2><div id="liveData" class="muted">Click Refresh live data after logging in. This queries payloadtype, c2profile, callback, and task through the gateway — the same GraphQL your Mythic UI uses.</div></div>
 <div class="card"><h2>What is live in the ATMA native lab (2026-10-24, sandbox)</h2><p><b>Payload types (6, verified via GraphQL):</b> poseidon, medusa, apfell, nemesis, arachne, merlin.<br><b>C2 profiles (8, verified):</b> http, webshell, websocket, tcp, dynamichttp, smb, httpx, dns.<br><b>Paused, awaiting operator decision:</b> apollo, athena — service source + agent_code installed, but the service will not start without a Python dependency that was named in an upstream file that did not pass a safety check. See README §17. Do not install it until the operator says so in plain words.<br><b>Not built on Linux:</b> apfell payloads run on macOS only (service/build side is native); Apollo/Athena payloads are Windows .NET (service side is Linux, payload runs on Windows).<br><span class="muted">The sandbox is disposable. On a production host, run the same installers from lab/native/ with that host's own .env.</span></p></div>`;
}
window.liveLogin=async()=>{
 const gw=$("#liveGw").value.trim().replace(/\/$/,""), tok=$("#liveGwTok").value.trim(), user=$("#liveUser").value.trim(), pass=$("#livePass").value.trim();
 const out=$("#liveOut");
 if(!gw||!user||!pass){ out.innerHTML="<p>Enter gateway URL, operator username, and password.</p>"; return; }
 if(tok) localStorage.setItem("atma_gateway_token",tok);
 localStorage.setItem("atma_gateway_url",gw);
 const gwTok=tok||localStorage.getItem("atma_gateway_token")||"";
 out.innerHTML="<p class='muted'>Logging in via gateway…</p>";
 try{
  const r=await fetch(gw+"/mythic/auth",{method:"POST",headers:{"Content-Type":"application/json","x-atma-token":gwTok},body:JSON.stringify({username:user,password:pass})});
  const j=await r.json();
  if(!r.ok||!j.access_token){ out.innerHTML=`<p>Login failed: HTTP ${r.status}.</p><pre>${esc(JSON.stringify(j).slice(0,500))}</pre>`; return; }
  localStorage.setItem("atma_mythic_jwt",j.access_token);
  out.innerHTML="<p><b>Logged in via gateway.</b> Operator token saved in this browser only. Click Refresh live data.</p>";
  liveRefresh();
 }catch(e){ out.innerHTML=`<p>Login error: ${esc(e.message)}. Check the gateway URL, that the host gateway is running with ATMA_GATEWAY_TOKEN set, and that your phone is on the same Tailscale network.</p>`; }
};
window.liveLogout=()=>{localStorage.removeItem("atma_mythic_jwt"); localStorage.removeItem("atma_gateway_token"); render();};
window.liveRefresh=async()=>{
 const gw=(localStorage.getItem("atma_gateway_url")||"").replace(/\/$/,""), gwTok=localStorage.getItem("atma_gateway_token")||"", jwt=localStorage.getItem("atma_mythic_jwt")||"";
 const el=$("#liveData"); if(!el) return;
 if(!gw||!gwTok||!jwt){ el.innerHTML="<p class='muted'>Log in via gateway first (gateway URL + gateway token + operator login).</p>"; return; }
 el.innerHTML="<p class='muted'>Querying your Mythic server via the gateway…</p>";
 try{
  const r=await fetch(gw+"/mythic/graphql",{method:"POST",headers:{"Content-Type":"application/json","x-atma-token":gwTok,"Authorization":"Bearer "+jwt},body:JSON.stringify({query:"{ payloadtype { name } c2profile { name } callback { id display_id host user } task { id display_id command } }"})});
  const j=await r.json();
  if(j.errors){ el.innerHTML=`<p>GraphQL returned errors (your operator token may have expired — log in again).</p><pre>${esc(JSON.stringify(j.errors).slice(0,1000))}</pre>`; return; }
  const d=j.data||{};
  el.innerHTML=`<p><b>Payload types:</b> ${(d.payloadtype||[]).map(x=>esc(x.name)).join(", ")||"none"}<br><b>C2 profiles:</b> ${(d.c2profile||[]).map(x=>esc(x.name)).join(", ")||"none"}<br><b>Callbacks:</b> ${(d.callback||[]).map(c=>esc(c.display_id+" "+(c.host||"")+" "+(c.user||""))).join(", ")||"none"}<br><b>Tasks (latest view):</b> ${(d.task||[]).slice(0,20).map(t=>esc(t.display_id+" "+(t.command||""))).join(", ")||"none"}</p><pre>${esc(JSON.stringify(d,null,2).slice(0,4000))}</pre>`;
 }catch(e){ el.innerHTML=`<p>Live query error: ${esc(e.message)}</p>`; }
};
function viewMissions(){
 return `<h1>Missions — serverless backend</h1><p class="muted">Missions run in GitHub Actions, not in this browser. A mission takes a few minutes: the workflow calls Groq with the repo secret inside the runner, commits its output to <code>docs/backend/missions/</code>, and this tab reads it back as static JSON. That is the OpenForge Actions-as-backend pattern, replicated for ATMA.</p>
 <div class="card"><h2>Request a mission</h2><p class="muted">Option 1 (no token): run this on any machine with <code>gh</code> authenticated to this repo. Option 2: save a GitHub token in this browser only (fine-grained, this repo, <code>actions:write</code>) and dispatch from here — the token is sent only to api.github.com, never committed.</p>
 <label>Mission id</label><input class="field" id="mId" placeholder="e.g. mythic-overview">
 <label>Prompt</label><textarea class="field" id="mPrompt" placeholder="e.g. Summarise Mythic operations and roles for a new operator"></textarea>
 <label>Kind</label><select class="field" id="mKind"><option>analysis</option><option>briefing</option><option>mission</option></select>
 <label>GitHub token (optional, local only)</label><input class="field" id="ghToken" type="password" placeholder="${localStorage.getItem("atma_gh_token")?"Token saved — paste a new one to replace it":"Paste a fine-grained GitHub token (actions:write, this repo only)"}">
 <button class="btn" onclick="dispatchMission()">Dispatch mission</button> <button class="btn2" onclick="clearGhToken()">Remove saved token</button><div id="mOut" style="margin-top:10px"></div>
 <pre id="mCmd">gh workflow run atma-agent.yml -f mission_id=YOUR-ID -f prompt="YOUR PROMPT" -f kind=analysis
# Workflows must first be copied from github-workflows/ to .github/workflows/ (see Backend tab).</pre></div>
 <div class="card"><h2>Mission results</h2><div id="missionsList" class="muted">Loading missions…</div></div>`;
}
function viewBackend(){
 return `<h1>Backend — serverless, OpenForge-style</h1><p class="muted">No persistent server. GitHub Actions is the borrowed backend, git is the database. Each workflow owns only its own files, so ticks, missions, and probes cannot overwrite each other.</p>
 <div class="card"><h2>Status</h2><div id="backendStatus" class="muted">Loading status…</div></div>
 <div class="card"><h2>Key health</h2><div id="backendKey" class="muted">Loading key status…</div></div>
 <div class="card"><h2>Install the workflows (one manual step)</h2><p class="muted">GitHub Apps cannot create workflow files, so copy each file from <code>github-workflows/</code> to <code>.github/workflows/</code> in this repo, once: <code>atma-agent.yml</code>, <code>atma-scheduler.yml</code>, <code>atma-key-probe.yml</code>, <code>groq-briefing.yml</code>. After that, the scheduler ticks daily, and missions/probes run on dispatch.</p></div>
 <div class="card"><h2>What this backend cannot do</h2><p class="muted">Actions missions take minutes, not seconds, and this tab cannot do persistent connections, Mythic callbacks, live C2, or payload builds. Those need your own Mythic server (see <code>server/</code>). Real-time chat is a different path: the companion gateway (<code>agent/atma-gateway.mjs</code>) streams Groq tokens live to the assistant — run it on your host, expose it with Tailscale Serve, and point Connect at it.</p></div>`;
}
const views={dashboard:viewDashboard,callbacks:viewCallbacks,operations:viewOperations,payloads:viewPayloads,c2:viewC2,files:viewFiles,catalog:viewCatalog,missions:viewMissions,backend:viewBackend,docs:viewDocs,connect:viewConnect,live:viewLive};
let current="dashboard";
function render(){
 if(!views[current]){
  $("#main").innerHTML=`<div class="card"><h2>View not loaded</h2><p class="muted">The "${esc(current)}" view is not in the app bundle this browser loaded — this usually means a cached old app.js. Hard-refresh (Ctrl+Shift+R) to load the newest version.</p></div>`;
  return;
 }
 $("#main").innerHTML=views[current]();
 document.querySelectorAll("nav button[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===current));
 if(current==="dashboard") loadBriefing();
 if(current==="missions") loadMissions();
 if(current==="backend") loadBackend();
 updateAiPill();
}
function loadBriefing(){
 fetch("ai-briefing.json").then(r=>r.json()).then(j=>{
  const el=$("#briefBox"); if(!el) return;
  el.innerHTML=`<p>${esc(j.briefing||"")}</p><p class="muted">Source: ${esc(j.source||"starter")} · Updated: ${esc(j.updated||"")}</p>`;
  $("#briefPill").textContent="Briefing: "+(j.source||"starter");
 }).catch(()=>{const el=$("#briefBox"); if(el) el.textContent="Starter briefing not loaded — the workflow briefing will appear here after its first run.";});
}
function loadMissions(){
 fetch("backend/missions/index.json").then(r=>r.json()).then(j=>{
  const el=$("#missionsList"); if(!el) return;
  if(!j.missions || !j.missions.length){ el.innerHTML=`<p>No missions yet. ${esc(j.note||"")}</p>`; return; }
  el.innerHTML=j.missions.map(m=>`<div style="margin-bottom:14px"><b>${esc(m.mission)}</b> <span class="badge">${esc(m.kind||"")}</span> <span class="badge">${esc(m.source||"")}</span> <span class="muted">${esc(m.completed_at||"")}</span><p class="muted">Prompt: ${esc(m.prompt||"")}</p><pre>${esc(m.output||"")}</pre></div>`).join("");
 }).catch(()=>{const el=$("#missionsList"); if(el) el.textContent="Missions index not loaded — it appears after the first mission workflow runs.";});
}
function loadBackend(){
 fetch("backend/status.json").then(r=>r.json()).then(j=>{
  const el=$("#backendStatus"); if(el) el.innerHTML=`<pre>${esc(JSON.stringify(j,null,2))}</pre>`;
 }).catch(()=>{const el=$("#backendStatus"); if(el) el.textContent="Status not loaded.";});
 fetch("backend/key-status.json").then(r=>r.json()).then(j=>{
  const el=$("#backendKey"); if(el) el.innerHTML=`<pre>${esc(JSON.stringify(j,null,2))}</pre>`;
 }).catch(()=>{const el=$("#backendKey"); if(el) el.textContent="Key status not loaded.";});
}
window.dispatchMission=async()=>{
 const id=$("#mId").value.trim(), prompt=$("#mPrompt").value.trim(), kind=$("#mKind").value;
 const tok=$("#ghToken").value.trim();
 const out=$("#mOut");
 if(!id || !prompt){ out.innerHTML="<p>Enter a mission id and a prompt first.</p>"; return; }
 if(tok) localStorage.setItem("atma_gh_token",tok);
 const token=tok||localStorage.getItem("atma_gh_token")||"";
 if(!token){ out.innerHTML=`<p class="muted">No GitHub token saved. Use this command instead (workflows must be installed first):</p><pre>gh workflow run atma-agent.yml -f mission_id=${esc(id)} -f prompt=${esc(JSON.stringify(prompt))} -f kind=${esc(kind)}</pre>`; return; }
 out.innerHTML="<p class='muted'>Dispatching workflow…</p>";
 try{
  const r=await fetch("https://api.github.com/repos/Etienne0101-lab/Project-ATMA/actions/workflows/atma-agent.yml/dispatches",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token,"Accept":"application/vnd.github+json"},body:JSON.stringify({ref:"main",inputs:{mission_id:id,prompt,kind}})});
  if(r.status===204) out.innerHTML="<p><b>Mission dispatched.</b> It runs in GitHub Actions (a few minutes). Refresh this tab after the workflow commits its output.</p>";
  else { const t=await r.text(); out.innerHTML=`<p>Dispatch failed: HTTP ${r.status}. Check that the workflow file is installed in .github/workflows/, the token has actions:write on this repo, and the ref is main.</p><pre>${esc(t.slice(0,500))}</pre>`; }
 }catch(e){ out.innerHTML=`<p>Dispatch error: ${esc(e.message)}</p>`; }
};
window.clearGhToken=()=>{localStorage.removeItem("atma_gh_token"); render();};
function updateAiPill(){
 const bp=$("#bundlePill"); if(bp) bp.textContent="Bundle: serverless-6";
 const has=!!localStorage.getItem("atma_groq_key");
 $("#aiPill").textContent=has?"AI: Groq (browser key)":"AI: Offline demo";
 const m=localStorage.getItem("atma_mythic_url");
 $("#modePill").textContent=m?"DEMO DATA — Mythic URL saved locally, not connected":"DEMO DATA — no real Mythic server connected";
}
window.selectCb=id=>{selected=callbacks.find(c=>c.id===id); render();};
window.setFilter=v=>{cbFilter=v; const el=$("#cbSearch"); const pos=el?el.selectionStart:0; render(); const n=$("#cbSearch"); if(n){n.focus(); n.setSelectionRange(pos,pos);}};
window.pickCmd=c=>{const i=$("#taskInput"); if(i){i.value=c; i.focus();}};
window.issueTask=()=>{
 const v=$("#taskInput").value.trim(); if(!v) return;
 (tasks[selected.id]=tasks[selected.id]||[]).push({cmd:v,out:simOutput(selected,v),status:"completed"});
 render();
};
window.buildPayload=()=>{
 const a=$("#pbAgent").value, os=$("#pbOs").value, c2=$("#pbC2").value, host=$("#pbHost").value||"YOUR-CALLBACK-HOST", interval=$("#pbInt").value||"10", cmds=$("#pbCmds").value.trim()||(commands[a]||[]).join(", ");
 const info=agents.find(x=>x.name===a);
 const summary={payload_type:a,os,c2_profile:c2,callback_host:host,callback_interval_seconds:Number(interval),commands:cmds.split(",").map(s=>s.trim()).filter(Boolean),note:"Configuration summary only — no payload was built, compiled, or delivered.",install_commands:[`sudo ./mythic-cli install github https://github.com/MythicAgents/${a}`,`sudo ./mythic-cli install github https://github.com/MythicC2Profiles/${c2}`]};
 $("#pbOut").innerHTML=`<p><b>${a}</b> — ${info.os} · ${info.lang}<br><span class="muted">${info.note}</span></p><pre>${esc(JSON.stringify(summary,null,2))}</pre><p class="muted">Run those install commands inside your own Mythic instance, then create the payload from its UI with the parameters above.</p>`;
};
window.importCatalog=async()=>{
 const out=$("#catalogOut"); out.innerHTML="<p class='muted'>Fetching public org listings from GitHub…</p>";
 try{
  const [ag,c2]=await Promise.all([fetch("https://api.github.com/orgs/MythicAgents/repos?per_page=100").then(r=>{if(!r.ok) throw new Error("MythicAgents HTTP "+r.status); return r.json();}),fetch("https://api.github.com/orgs/MythicC2Profiles/repos?per_page=100").then(r=>{if(!r.ok) throw new Error("MythicC2Profiles HTTP "+r.status); return r.json();})]);
  const fmt=list=>list.map(r=>({name:r.name,description:r.description,url:r.html_url}));
  const data={imported_at:new Date().toISOString(),agents:fmt(ag),c2_profiles:fmt(c2)};
  localStorage.setItem("atma_catalog",JSON.stringify(data));
  out.innerHTML=`<p><b>Imported:</b> ${data.agents.length} agent repos, ${data.c2_profiles.length} C2 profile repos. Saved in this browser.</p><pre>${esc(JSON.stringify(data,null,2).slice(0,6000))}</pre>`;
 }catch(e){ out.innerHTML=`<p>Import failed: ${esc(e.message)}. This is usually GitHub's unauthenticated rate limit (60/hour) or a network block. The built-in catalog above still works.</p>`; }
};
window.clearCatalog=()=>{localStorage.removeItem("atma_catalog"); render();};
window.saveGroq=()=>{const k=$("#groqKey").value.trim(); if(!k){alert("Paste a Groq key first.");return;} localStorage.setItem("atma_groq_key",k); localStorage.setItem("atma_groq_model",$("#groqModel").value.trim()||"llama-3.3-70b-versatile"); render(); addMsg("assistant","Groq key saved in this browser only. Ask me something and I will answer live via Groq.");};
window.clearGroq=()=>{localStorage.removeItem("atma_groq_key"); render(); addMsg("assistant","Saved Groq key removed. Back to offline demo mode.");};
window.saveGateway=()=>{const u=$("#gwUrl").value.trim().replace(/\/$/,""); if(!u){alert("Paste a gateway URL first.");return;} localStorage.setItem("atma_gateway_url",u); localStorage.setItem("atma_chat_backend","gateway"); render(); addMsg("assistant","Gateway URL saved. Set the assistant backend to Gateway (host) in the chat controls and send a message to stream through your host.");};
window.clearGateway=()=>{localStorage.removeItem("atma_gateway_url"); render(); addMsg("assistant","Gateway URL removed.");};
window.saveMythic=()=>{localStorage.setItem("atma_mythic_url",$("#mythicUrl").value.trim()); localStorage.setItem("atma_mythic_gql",$("#mythicGql").value.trim()||"/graphql"); if($("#mythicToken").value.trim()) localStorage.setItem("atma_mythic_token",$("#mythicToken").value.trim()); render(); addMsg("assistant","Mythic URL saved locally in this browser only. Use Test Connection to check what the browser can actually reach.");};
window.testMythic=async()=>{
 const url=$("#mythicUrl").value.trim(), path=$("#mythicGql").value.trim()||"/graphql", token=$("#mythicToken").value.trim()||localStorage.getItem("atma_mythic_token")||"";
 const out=$("#mythicTest"); if(!url){out.innerHTML="<p>Enter a Mythic base URL first.</p>"; return;}
 out.innerHTML="<p class='muted'>Testing… (this only talks to the URL you entered, from your browser)</p>";
 try{
  const headers={"Content-Type":"application/json"}; if(token) headers["Authorization"]="Bearer "+token;
  const r=await fetch(url.replace(/\/$/,"")+path,{method:"POST",headers,body:JSON.stringify({query:"{ callback { id } }"})});
  const txt=await r.text();
  out.innerHTML=`<p><b>GraphQL endpoint responded: HTTP ${r.status}.</b></p><pre>${esc(txt.slice(0,1000))}</pre><p class="muted">If this is not a callback list, your Mythic GraphQL schema/path or auth differs — check your Mythic instance's own UI/docs, and do not paste production credentials into a public demo.</p>`;
 }catch(e){
  out.innerHTML=`<p><b>Browser could not reach that endpoint: ${esc(e.message)}.</b></p><p class="muted">Common causes: the Mythic host is not running, is not reachable from this device, or the browser blocked it for CORS / mixed-content (Pages is HTTPS, so an http:// Mythic URL will be blocked). Fix is on the Mythic-host side — a same-origin reverse proxy, or using Mythic's own UI on that host. Demo mode remains available.</p>`;
 }
};
document.querySelectorAll("nav button[data-view]").forEach(b=>b.addEventListener("click",()=>{current=b.dataset.view; render();}));
function md(text){
 // Safe markdown-lite: escape first, then bold / inline code / newlines only.
 let h=esc(text);
 h=h.replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>");
 return h;
}
function saveChatHistory(){
 try{ const msgs=[...document.querySelectorAll("#chat .msg")].map(m=>({who:m.classList.contains("me")?"you":"assistant",text:m.dataset.text||m.textContent})); localStorage.setItem("atma_chat_history",JSON.stringify(msgs.slice(-50))); }catch{}
}
function addMsg(who,text){
 const d=document.createElement("div"); d.className="msg"+(who==="you"?" me":""); d.dataset.text=text;
 d.innerHTML=`<div class="who">${who==="you"?"You":"ATMA Assistant"}</div><div>${md(text)}</div>`;
 $("#chat").appendChild(d); $("#chat").scrollTop=$("#chat").scrollHeight; saveChatHistory();
 return d;
}
let chatAbort=null;
function stopChat(){ if(chatAbort) chatAbort.abort(); }
function demoAnswer(q){
 const l=q.toLowerCase();
 if(l.includes("how many callback")) return "Demo mode right now: "+callbacks.length+" callbacks, "+callbacks.filter(c=>c.status==="live").length+" live. In a real Mythic instance that number comes from your operation's callback list, not from this page.";
 if(l.includes("operation")) return "Operations group callbacks, tasks, payloads, and files for reporting and collaboration. Roles: lead (full control), operator (normal tasking and payload creation), spectator (read-only). Block lists let you forbid specific commands for a specific operator and payload type. See the Operations tab.";
 if(l.includes("task")&&l.includes("lifecycle")||l.includes("preprocessing")||l.includes("submitted")) return "Task lifecycle in Mythic: preprocessing (payload-type command file validates the task) → submitted (ready for the agent) → processing (agent pulled it) → processed (at least one response) → completed, or error if the agent reports failure. You can filter tasks in the callback view in Mythic's own UI.";
 if(l.includes("file")) return "Files in Mythic: downloads, screenshots, and task output from callbacks land in the operation's file browser. This console's Files tab shows demo placeholders only — no file is transferred here.";
 if(l.includes("callback")) return "In Mythic, a callback is a registered agent session on a host. Operators issue tasks to a callback (like whoami or ls in this demo) and results come back as task output. Callbacks check in on an interval with jitter over their C2 profile. Dead callbacks have missed check-ins; linked (P2P) callbacks may show long gaps because they only check in when they have data.";
 if(l.includes("payload")||l.includes("apollo")||l.includes("apfell")||l.includes("poseidon")||l.includes("athena")||l.includes("medusa")) return "Payload types are agent implementations installed separately into Mythic: apollo (Windows, C#), apfell (macOS, JXA), poseidon (Linux/macOS, Go), athena (Windows, .NET), medusa (cross-platform, Python). Commands per agent are in the Payload Builder tab, and Catalog Import fetches the current public org listings. This Pages app does not build real payloads.";
 if(l.includes("c2")||l.includes("smb")||l.includes("websocket")||l.includes("http")) return "C2 profiles are the transport: http/dynamichttp for direct egress, websocket for WebSocket callbacks, and smb/tcp as peer-to-peer channels that link agents so only one needs a route out. See the C2 tab, and Catalog Import for the current MythicC2Profiles list.";
 if(l.includes("start")||l.includes("install")||l.includes("docker")||l.includes("deploy")) return "On your own machine: sudo make to build mythic-cli, then sudo ./mythic-cli start to bring up the Docker containers. Install agents with ./mythic-cli install github <agent repo> and C2 profiles the same way. Use ./mythic-cli update to check for updates (it does not apply them). GitHub Pages cannot run those containers — Pages hosts only this console.";
 if(l.includes("troubleshoot")||l.includes("dead")||l.includes("not connect")||l.includes("cors")) return "If a callback is dead, check its last check-in, C2 profile, and whether the host can still reach the Mythic server. If this console cannot reach your Mythic server, the Test Connection button in Connect reports the real browser error — most often CORS or HTTPS mixed-content, fixed with a same-origin reverse proxy or by using Mythic's own UI on that host.";
 if(l.includes("groq")||l.includes("key")||l.includes("secret")) return "Security model here: the repo secret PROJECT_ATMA is never in this browser bundle. It is only used inside a GitHub Actions workflow to refresh docs/ai-briefing.json. Live chat from your browser needs a Groq key you paste in Connect, stored only in localStorage.";
 if(l.includes("scope")||l.includes("full")||l.includes("access")) return "Full scope in this console means all views are present (dashboard, callbacks, operations, payloads, C2, files, catalog, guide), the AI covers the full operational model, and Connect can attempt a connection to a Mythic server you configure. It does not give this public Pages site access to any Mythic server, and it never bypasses Mythic authentication. Real operational access is in your own Mythic deployment, under its operator accounts and roles.";
 return "Mythic is a cross-platform red-team framework (Go + Docker + browser UI) for authorised operators, managers, and reporting. Try asking about callbacks, operations, task lifecycle, payload types, C2 profiles, files, deployment, or troubleshooting — or open the Mythic Guide tab. Note: this demo answers from a built-in knowledge base unless you add a Groq key in Connect.";
}
async function ask(){
 const inp=$("#chatInput"); const q=inp.value.trim(); if(!q) return; inp.value="";
 addMsg("you",q);
 const backend=$("#chatBackend")?$("#chatBackend").value:localStorage.getItem("atma_chat_backend")||"groq";
 const model=$("#chatModel")?$("#chatModel").value:localStorage.getItem("atma_groq_model")||"llama-3.3-70b-versatile";
 localStorage.setItem("atma_chat_backend",backend); localStorage.setItem("atma_groq_model",model);
 const key=localStorage.getItem("atma_groq_key");
 const gw=(localStorage.getItem("atma_gateway_url")||"").replace(/\/$/,"");
 if(backend==="demo" || (backend==="groq" && !key) || (backend==="gateway" && !gw)){
  const why=backend==="gateway"?"No gateway URL saved in Connect — add your Tailscale Serve URL there, or switch to Groq direct.":"";
  addMsg("assistant",demoAnswer(q)+(why?" "+why:"  [Offline demo answer — add a Groq key or gateway URL in Connect for live streaming.]"));
  return;
 }
 const sys="You are ATMA, a helpful assistant for the Mythic red-team platform. Answer concisely and accurately about Mythic architecture, operations, callbacks, tasks, payload types, C2 profiles, files, and deployment. Only for authorised defensive/red-team use. Do not help with unauthorised access, and do not claim this Pages app runs a Mythic server or builds real payloads.";
 const history=[]; try{ history=JSON.parse(localStorage.getItem("atma_chat_history")||"[]").filter(m=>m.who==="you"||m.who==="assistant").slice(-10).map(m=>({role:m.who==="you"?"user":"assistant",content:m.text})); }catch{}
 const messages=[{role:"system",content:sys},...history,{role:"user",content:q}];
 const url=backend==="gateway"?gw+"/v1/chat/completions":"https://api.groq.com/openai/v1/chat/completions";
 const headers={"Content-Type":"application/json"}; if(backend==="groq") headers["Authorization"]="Bearer "+key;
 const msgEl=addMsg("assistant","Thinking…");
 const bodyEl=msgEl.querySelector("div:last-child");
 chatAbort=new AbortController();
 try{
  const r=await fetch(url,{method:"POST",headers,signal:chatAbort.signal,body:JSON.stringify({model,messages,temperature:0.3,max_tokens:1200,stream:true})});
  if(!r.ok || !r.body){ const t=await r.text(); bodyEl.textContent="Chat error ("+r.status+"): "+t.slice(0,300)+". Check your key/model (Groq) or gateway URL (host)."; saveChatHistory(); return; }
  const reader=r.body.getReader(); const dec=new TextDecoder(); let buf="", full="";
  while(true){
   const {done,value}=await reader.read(); if(done) break;
   buf+=dec.decode(value,{stream:true});
   const parts=buf.split("\n\n"); buf=parts.pop();
   for(const p of parts){
    const line=p.trim(); if(!line.startsWith("data:")) continue;
    const data=line.slice(5).trim(); if(data==="[DONE]") continue;
    try{ const j=JSON.parse(data); const tok=j.choices&&j.choices[0]&&j.choices[0].delta?j.choices[0].delta.content:""; if(tok){ full+=tok; msgEl.dataset.text=full; bodyEl.innerHTML=md(full); $("#chat").scrollTop=$("#chat").scrollHeight; } }catch{}
   }
  }
  if(!full) bodyEl.textContent="Stream completed without a text response — try again or switch model/backend.";
  saveChatHistory();
 }catch(e){ if(e.name==="AbortError") bodyEl.textContent+="  [Stopped]"; else bodyEl.textContent="Network error: "+e.message+". If you chose Gateway, check the host is running and the Serve URL is reachable from this device."; saveChatHistory(); }
 finally{ chatAbort=null; }
}
$("#sendBtn").addEventListener("click",ask);
$("#stopBtn").addEventListener("click",stopChat);
$("#chatInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault(); ask();}});
$("#chatModel").addEventListener("change",e=>localStorage.setItem("atma_groq_model",e.target.value));
$("#chatBackend").addEventListener("change",e=>localStorage.setItem("atma_chat_backend",e.target.value));
$("#newChatBtn").addEventListener("click",()=>{ $("#chat").innerHTML=""; localStorage.removeItem("atma_chat_history"); addMsg("assistant","New chat started. Ask about Mythic operations, task lifecycle, or deployment."); });
(function initChat(){
 const savedModel=localStorage.getItem("atma_groq_model"); if(savedModel && $("#chatModel")) $("#chatModel").value=savedModel;
 const savedBackend=localStorage.getItem("atma_chat_backend"); if(savedBackend && $("#chatBackend")) $("#chatBackend").value=savedBackend;
 try{ const h=JSON.parse(localStorage.getItem("atma_chat_history")||"[]"); if(h.length){ h.forEach(m=>addMsg(m.who,m.text)); return; } }catch{}
 addMsg("assistant","Hi — I'm ATMA. Pages is live, and this console now covers dashboard, callbacks, operations, payloads, C2, files, and catalog import. Ask about Mythic operations, task lifecycle, or deployment — or add your Groq key in Connect for live answers.");
})();
render();
