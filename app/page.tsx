import { useEffect, useMemo, useState } from "react";
import { GET as fetchDashboard } from "./dashboard";

type Proposal = {
  id: number; sigla: string; ementa: string; status: string; orgao: string;
  atualizado: string; url: string; pdf?: string; tema: string; priority?: "alta" | "media" | "normal";
  siglaTipo?: string; ano?: number; emTramitacao?: boolean;
  nextStep?: string; flow?: { id: string; data: string; orgao: string; descricao: string; despacho: string }[];
};
type Committee = { id: number; sigla: string; nome: string; papel: string; situacao: string; url: string };
type AgendaTopic = { ordem: number; titulo: string; ementa: string; situacao: string; url: string };
type EventItem = { id: number; data: string; hora: string; horaFim?: string; titulo: string; tipo?: string; local: string; orgao: string; orgaoNome?: string; situacao: string; url: string; urlPauta?: string; requerido?: boolean; plenary?: boolean; pauta?: AgendaTopic[] };
type Expense = { id:string; month:number; type:string; supplier:string; date:string; value:number; glosa:number; document:string; url:string };
type Spending = { year:number; total:number; glosa:number; totalDocuments:number; byMonth:{month:number;total:number}[]; byType:{type:string;total:number;count:number}[]; expenses:Expense[] };
type DashboardData = { proposals: Proposal[]; committees: Committee[]; events: EventItem[]; spending?:Spending; yearCounts?: {year:number;count:number}[]; selectedYear?: number; updatedAt: string; source: "live" | "fallback" };

const fallback: DashboardData = { source: "fallback", updatedAt: "", proposals: [], committees: [], events: [] };

const nav = [
  ["painel", "Painel"], ["proposicoes", "Proposições"], ["agenda", "Agenda"],
  ["gastos", "Gastos"], ["comissoes", "Comissões"]
] as const;

const money = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
    external: <><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
    bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    wallet: <><path d="M3 7h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7z"/><path d="M3 7V5a2 2 0 0 1 2-2h12v4M15 12h6v4h-6a2 2 0 0 1 0-4z"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function Home() {
  const [section, setSection] = useState("painel");
  const [data, setData] = useState<DashboardData>(fallback);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [proposalYear, setProposalYear] = useState(new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [expenseYear, setExpenseYear] = useState(new Date().getFullYear());

  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const weekStart = useMemo(() => {
    const date = new Date();
    const day = date.getDay();
    date.setDate(date.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    date.setHours(12, 0, 0, 0);
    return date;
  }, [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  }), [weekStart]);

  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({
      weekStart: weekStart.toISOString().slice(0, 10),
      year: String(proposalYear),
      expenseYear: String(expenseYear),
    });
    setLoading(true);
    setLoadError(false);
    fetchDashboard(new Request(`https://dadosabertos.camara.leg.br/?${params}`))
      .then(response => {
        if (!response.ok) throw new Error("Dados oficiais indisponíveis");
        return response.json();
      })
      .then(result => { if (current) setData(result); })
      .catch(() => { if (current) setLoadError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [weekStart, proposalYear, expenseYear, retry]);

  const filtered = useMemo(() => data.proposals.filter(p => `${p.sigla} ${p.ementa} ${p.orgao}`.toLowerCase().includes(query.toLowerCase()) && (typeFilter === "todos" || p.siglaTipo === typeFilter) && (statusFilter === "todos" || (statusFilter === "tramitando" ? p.emTramitacao : !p.emTramitacao))), [data.proposals, query, typeFilter, statusFilter]);
  const proposalTypes = useMemo(() => [...new Set(data.proposals.map(p=>p.siglaTipo).filter(Boolean))] as string[], [data.proposals]);
  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" }).format(today);
  const go = (destination: string) => {
    setSection(destination);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span/><span/><span/></div><div><strong>Observatório</strong><small>Paulo Lemos</small></div></div>
      <nav aria-label="Navegação principal">
        {nav.map(([id,label], i) => <button key={id} className={section===id ? "active" : ""} onClick={() => go(id)}><Icon name={["grid","file","calendar","wallet","users","bookmark"][i]}/><span>{label}</span></button>)}
      </nav>
      <div className="sidebar-bottom">
        <a href="https://www.camara.leg.br/deputados/233592" target="_blank" rel="noreferrer"><Icon name="external"/>Página oficial</a>
        <div className="user"><div className="avatar">PL</div><div><strong>Gabinete parlamentar</strong><span>Consulta pública</span></div><span className="online"/></div>
      </div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div><h1>{nav.find(n=>n[0]===section)?.[1]}</h1><p>{dateLabel.charAt(0).toUpperCase()+dateLabel.slice(1)}</p></div>
        <div className="top-actions"><label className="global-search"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar proposição, tema ou comissão…"/></label></div>
      </header>

      {loadError && <div className="status-strip" role="alert">
        <div><strong>Não foi possível carregar os dados solicitados.</strong><span>Consulte a página oficial da Câmara ou tente novamente.</span></div>
        <button className="primary" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>
      </div>}
      {section === "painel" && <>
        <section className="status-strip">
          <div className="live-dot"/><div><strong>{loading ? "Sincronizando dados oficiais" : data.source === "live" ? "Dados oficiais atualizados" : "Dados oficiais indisponíveis"}</strong><span>Fonte: Dados Abertos da Câmara dos Deputados · atualização automática</span></div>
          <span className="last-update">{data.source === "live" ? `Brasília · ${new Date(data.updatedAt).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})}` : "Aguardando fonte oficial"}</span>
        </section>

        <section className="kpis">
          <button onClick={()=>go("proposicoes")}><div className="kpi-icon teal"><Icon name="file"/></div><div><span>Proposições em {new Date().getFullYear()}</span><strong>{data.yearCounts?.find(y=>y.year===new Date().getFullYear())?.count ?? data.proposals.length}</strong><small>abrir proposições →</small></div></button>
          <button onClick={()=>go("agenda")}><div className="kpi-icon blue"><Icon name="calendar"/></div><div><span>Compromissos na semana</span><strong>{data.events.length}</strong><small>abrir agenda →</small></div></button>
          <button onClick={()=>go("gastos")}><div className="kpi-icon violet"><Icon name="wallet"/></div><div><span>Despesas em {data.spending?.year || expenseYear}</span><strong className="kpi-money">{money.format(data.spending?.total || 0)}</strong><small>abrir transparência →</small></div></button>
        </section>

        <div className="dashboard-grid">
          <section className="panel agenda-panel">
            <div className="panel-head"><div><span className="eyebrow">AGENDA LEGISLATIVA</span><h2>Compromissos na semana</h2></div><button onClick={()=>go("agenda")}>Agenda completa <span>→</span></button></div>
            <div className="timeline">
              {data.events.slice(0,4).map((e,i)=><article key={e.id} className={i===0?"current":""}><time>{e.hora}</time><div className="line"><span/></div><div className="event-copy"><div><span className={`tag ${e.plenary?"plenary-tag":""}`}>{e.plenary?"PLENÁRIO":e.orgao}</span><span className="event-status">{e.situacao}</span></div><h3>{e.titulo}</h3><p>{e.local} · horário de Brasília</p><a href={e.url} target="_blank" rel="noreferrer">Abrir evento oficial <Icon name="external"/></a></div></article>)}
            </div>
          </section>

        </div>

        <section className="panel proposal-panel">
          <div className="panel-head"><div><span className="eyebrow">MONITORAMENTO LEGISLATIVO</span><h2>Proposições em foco</h2></div><button onClick={()=>go("proposicoes")}>Ver todas <span>→</span></button></div>
          <ProposalTable proposals={filtered.slice(0,5)}/>
        </section>
      </>}

      {section === "proposicoes" && <ContentPage eyebrow="BASE LEGISLATIVA" title="Proposições do mandato" description="Filtre por ano, tipo e situação, com acesso à íntegra e à tramitação oficial."><div className="year-strip">{(data.yearCounts || [{year:proposalYear,count:data.proposals.length}]).map(item=><button key={item.year} className={proposalYear===item.year?"active":""} onClick={()=>setProposalYear(item.year)}><strong>{item.year}</strong><span>{item.count} proposições</span></button>)}</div><div className="filter-bar"><label>Ano<select value={proposalYear} onChange={e=>setProposalYear(Number(e.target.value))}>{(data.yearCounts || []).map(item=><option key={item.year} value={item.year}>{item.year}</option>)}</select></label><label>Tipo de proposta<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="todos">Todos os tipos</option>{proposalTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label><label>Situação<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="todos">Todas</option><option value="tramitando">Em tramitação</option><option value="encerradas">Fora de tramitação</option></select></label><a href={`https://www.camara.leg.br/busca-portal?contextoBusca=BuscaProposicoes&pagina=1&order=data&abaEspecifica=true&q=autores.ideCadastro%3A%20233592%20AND%20dataApresentacao%3A%5B${proposalYear}-01-01%20TO%20${proposalYear}-12-31%5D`} target="_blank" rel="noreferrer">Conferir busca oficial <Icon name="external"/></a></div><div className="search-row"><label className="global-search large"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filtrar por número, ementa, órgão ou tema…"/></label><span>{filtered.length} resultados em {proposalYear}</span></div><ProposalTable proposals={filtered}/></ContentPage>}

      {section === "agenda" && <>
        <section className="page-intro agenda-intro"><div><span className="eyebrow">SEMANA LEGISLATIVA · HORÁRIO DE BRASÍLIA</span><h2>Plenário, deputado e comissões</h2><p>Uma agenda única com sessões do Plenário, compromissos esperados, reuniões dos colegiados e respectivos itens de pauta.</p></div><div className="week-controls"><button onClick={()=>setWeekOffset(weekOffset-1)}>‹</button><button onClick={()=>setWeekOffset(0)}>Semana atual</button><button onClick={()=>setWeekOffset(weekOffset+1)}>›</button></div></section>
        <section className="panel weekly-panel">
          <div className="week-summary"><strong>{weekStart.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",timeZone:"America/Sao_Paulo"})} — {weekDays[4].toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric",timeZone:"America/Sao_Paulo"})}</strong><span>{data.events.filter(e=>e.plenary).length} do Plenário · {data.events.filter(e=>e.requerido).length} com presença esperada · {data.events.reduce((n,e)=>n+(e.pauta?.length||0),0)} itens de pauta</span></div>
          <div className="agenda-legend"><span><i className="legend-plenary"/>Plenário</span><span><i className="legend-required"/>Presença esperada</span><span><i/>Outros eventos</span></div><div className="week-grid">{weekDays.map(day=>{const iso=day.toISOString().slice(0,10);const events=data.events.filter(e=>e.data===iso);return <div className="day-column" key={iso}><header><span>{day.toLocaleDateString("pt-BR",{weekday:"short",timeZone:"America/Sao_Paulo"}).replace(".","")}</span><strong>{day.getDate()}</strong></header><div className="day-events">{events.length?events.map(e=><button className={`calendar-event ${e.requerido?"required":""} ${e.plenary?"plenary":""}`} key={e.id} onClick={()=>setSelectedEvent(e.id)}><time>{e.hora}{e.horaFim?`–${e.horaFim}`:""}</time><b>{e.plenary?"PLENÁRIO":e.orgao}</b><span>{e.titulo}</span><small>{e.local}</small>{e.requerido&&<em>Presença esperada</em>}{(e.pauta?.length||0)>0&&<i>{e.pauta?.length} itens na pauta</i>}</button>):<div className="no-events">Sem eventos oficiais</div>}</div></div>})}</div>
        </section>
        <section className="panel agenda-details"><div className="panel-head"><div><span className="eyebrow">PAUTAS DA SEMANA</span><h2>O que deve acontecer nas comissões</h2></div></div><div className="meeting-list">{data.events.filter(e=>(e.pauta?.length||0)>0).map(e=><article key={e.id} className={selectedEvent===e.id?"expanded":""}><button className="meeting-head" onClick={()=>setSelectedEvent(selectedEvent===e.id?null:e.id)}><div><span className="tag">{e.orgao}</span><strong>{e.titulo}</strong><small>{new Date(e.data+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})} · {e.hora} · {e.local}</small></div><div><b>{e.pauta?.length} itens</b><span>{selectedEvent===e.id?"−":"+"}</span></div></button>{selectedEvent===e.id&&<div className="pauta-body"><div className="pauta-actions"><a href={e.url} target="_blank" rel="noreferrer">Evento oficial <Icon name="external"/></a>{e.urlPauta&&<a href={e.urlPauta} target="_blank" rel="noreferrer">Documento da pauta <Icon name="external"/></a>}</div>{e.pauta?.map(item=><div className="pauta-item" key={`${e.id}-${item.ordem}`}><b>{item.ordem}</b><div><span>{item.titulo} · {item.situacao}</span><p>{item.ementa}</p><div className="pauta-item-actions"><a href={item.url} target="_blank" rel="noreferrer">Abrir item na Câmara <Icon name="external"/></a></div></div></div>)}</div>}</article>)}</div>{!data.events.some(e=>(e.pauta?.length||0)>0)&&<div className="empty-state compact"><Icon name="calendar"/><h3>Nenhuma pauta publicada nesta semana</h3><p>O painel consulta a Câmara automaticamente e exibirá os itens assim que forem disponibilizados.</p></div>}</section>
      </>}

      {section === "gastos" && <ContentPage eyebrow="TRANSPARÊNCIA · CEAP" title="Despesas do mandato" description="Reembolsos da Cota para o Exercício da Atividade Parlamentar, organizados por mês, categoria e documento fiscal.">
        <div className="expense-toolbar"><div>{Array.from({length:new Date().getFullYear()-2023+1},(_,i)=>new Date().getFullYear()-i).map(year=><button key={year} className={expenseYear===year?"active":""} onClick={()=>setExpenseYear(year)}>{year}</button>)}</div><a href={`https://www.camara.leg.br/deputados/233592/gastos-cota-parlamentar?ano=${expenseYear}`} target="_blank" rel="noreferrer">Conferir na Câmara <Icon name="external"/></a></div>
        <div className="expense-kpis"><article><span>Total líquido</span><strong>{money.format(data.spending?.total || 0)}</strong><small>valor reembolsado no ano</small></article><article><span>Documentos</span><strong>{data.spending?.totalDocuments || 0}</strong><small>notas e recibos publicados</small></article><article><span>Glosas</span><strong>{money.format(data.spending?.glosa || 0)}</strong><small>valores não reembolsados</small></article></div>
        <div className="expense-grid"><section className="expense-chart"><div className="subhead"><div><span className="eyebrow">EVOLUÇÃO MENSAL</span><h3>Gastos por mês</h3></div></div><div className="bars">{(data.spending?.byMonth || []).map(item=>{const max=Math.max(...(data.spending?.byMonth || []).map(m=>m.total),1);return <div className="bar-column" key={item.month}><span>{item.total?money.format(item.total).replace(",00",""):""}</span><div><i style={{height:`${Math.max(item.total/max*100,item.total?4:0)}%`}}/></div><b>{monthNames[item.month-1]}</b></div>})}</div></section><section className="expense-categories"><div className="subhead"><div><span className="eyebrow">COMPOSIÇÃO</span><h3>Principais categorias</h3></div></div>{(data.spending?.byType || []).slice(0,7).map(item=><div className="category-row" key={item.type}><div><strong>{item.type}</strong><span>{item.count} documentos</span></div><b>{money.format(item.total)}</b></div>)}</section></div>
        <section className="expense-documents"><div className="subhead"><div><span className="eyebrow">DOCUMENTOS OFICIAIS</span><h3>Lançamentos recentes</h3></div><span>{data.spending?.expenses.length || 0} exibidos</span></div><div className="expense-table">{(data.spending?.expenses || []).map(item=><article key={item.id}><time>{item.date?new Date(item.date+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</time><div><strong>{item.supplier}</strong><span>{item.type} · {item.document}</span></div><b>{money.format(item.value)}</b>{item.url?<a href={item.url.replace(/^http:/,"https:")} target="_blank" rel="noreferrer" aria-label="Abrir comprovante"><Icon name="external"/></a>:<span/>}</article>)}</div></section>
      </ContentPage>}

      {section === "comissoes" && <ContentPage eyebrow="COLEGIADOS" title="Comissões e responsabilidades" description="Onde o deputado é membro e quais agendas precisam ser acompanhadas."><div className="committee-grid">{data.committees.map(c=><article className="committee-card" key={c.id}><div className="committee-monogram">{c.sigla.slice(0,4)}</div><div><span className="role">{c.papel}</span><h3>{c.nome}</h3><p>{c.situacao}</p><a href={c.url} target="_blank" rel="noreferrer">Dados oficiais desta comissão <Icon name="external"/></a></div></article>)}</div></ContentPage>}

    </main>
  </div>;
}

function ContentPage({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children:React.ReactNode}) { return <><section className="page-intro"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></section><section className="panel content-panel">{children}</section></> }

function ProposalTable({proposals}:{proposals:Proposal[]}) {
  const [open, setOpen] = useState<number|null>(null);
  return <div className="proposal-table">{proposals.map(p=><article className={`proposal-row-wrap ${open===p.id?"open":""}`} key={p.id}><div className="proposal-row">
    <div className="proposal-main"><div className="proposal-title"><strong>{p.sigla}</strong><span className={`priority ${p.priority||"normal"}`}>{p.priority === "alta" ? "Alta prioridade" : p.status}</span></div><p>{p.ementa}</p><div className="proposal-meta"><span>{p.orgao}</span><span>Atualizada {p.atualizado}</span></div></div>
    <div className="proposal-links"><button className="flow-button" onClick={()=>setOpen(open===p.id?null:p.id)}>{open===p.id?"Fechar tramitação":"Ver tramitação"}</button><a href={p.url} target="_blank" rel="noreferrer">Página oficial <Icon name="external"/></a>{p.pdf && <a className="pdf" href={p.pdf} target="_blank" rel="noreferrer">Abrir PDF <Icon name="external"/></a>}</div>
  </div>{open===p.id&&<div className="legislative-flow"><div className="flow-summary"><span>SITUAÇÃO ATUAL</span><strong>{p.status}</strong><small>{p.orgao}</small></div><div className="flow-track">{p.flow?.length?p.flow.map((step,i)=><div className={`flow-step ${i===p.flow!.length-1?"current":""}`} key={step.id}><div className="flow-node"><span>{step.orgao}</span></div><div className="flow-copy"><b>{step.descricao}</b><small>{step.data}</small>{step.despacho&&<p>{step.despacho}</p>}</div></div>):<div className="flow-empty">A Câmara ainda não retornou etapas detalhadas para esta proposição.</div>}</div><div className="next-step"><span>ENCAMINHAMENTO</span><strong>{p.nextStep || "Aguardar atualização oficial"}</strong><p>Análise automática baseada na situação oficial mais recente; confirme a decisão no link da Câmara.</p></div></div>}</article>)}</div>
}
