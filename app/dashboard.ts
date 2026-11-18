const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const DEPUTY_ID = 233592;
const PLENARY_ORGAN_ID = 180;

type JsonRecord = Record<string, unknown>;
type ApiList = { dados?: JsonRecord[]; links?: { rel?: string; href?: string }[] };
type ApiDetail = { dados?: JsonRecord };

function readXmlFields(element: Element): JsonRecord {
  return Object.fromEntries(Array.from(element.children, child => {
    if (child.tagName === "orgaos") {
      return [child.tagName, Array.from(child.children, readXmlFields)];
    }
    return [child.tagName, child.childElementCount ? readXmlFields(child) : child.textContent];
  }));
}

async function get(path: string) {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Câmara API ${response.status} (${url.pathname})`);
  const body = await response.text();
  if (!body.trimStart().startsWith("<")) return JSON.parse(body);

  const xml = new DOMParser().parseFromString(body, "application/xml");
  const data = xml.documentElement.querySelector(":scope > dados");
  if (!data || xml.querySelector("parsererror")) {
    throw new Error(`Resposta XML inválida (${url.pathname})`);
  }
  const isDetail = /\/(eventos|proposicoes)\/\d+$/.test(url.pathname);
  return {
    dados: isDetail ? readXmlFields(data) : Array.from(data.children, readXmlFields),
    links: Array.from(xml.querySelectorAll("links > link"), readXmlFields),
  };
}

async function getExpenses(year: number) {
  const rows: JsonRecord[] = [];
  let next: string | undefined = `/deputados/${DEPUTY_ID}/despesas?${new URLSearchParams({ ano:String(year), itens:"100", ordem:"DESC", ordenarPor:"dataDocumento" })}`;
  for (let page = 0; next && page < 12; page += 1) {
    const response = await get(next) as ApiList;
    rows.push(...(response.dados || []));
    next = response.links?.find(link => link.rel === "next")?.href;
  }
  return rows;
}

function shortDate(value?: string) {
  if (!value) return "recentemente";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// A API da Câmara publica dataHoraInicio/dataHoraFim sem offset (ex.: 09:00).
// Esses valores já representam o horário oficial de Brasília; criar um Date
// faria o runtime tratá-los em outro fuso e deslocaria a agenda.
function chamberTime(value?: unknown) {
  if (!value) return "";
  const match = String(value).match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function propositionPage(item: JsonRecord, eventId: number) {
  const proposition = (item.proposicao_ || item.proposicao || {}) as JsonRecord;
  const candidates = [proposition.id, item.idProposicao, item.codProposicao];
  const directId = candidates.map(Number).find(Number.isFinite);
  if (directId) return `https://www.camara.leg.br/propostas-legislativas/${directId}`;

  const uri = String(proposition.uri || item.uriProposicao || item.uri || "");
  const match = uri.match(/\/proposicoes\/(\d+)/);
  if (match) return `https://www.camara.leg.br/propostas-legislativas/${match[1]}`;
  return `https://dadosabertos.camara.leg.br/api/v2/eventos/${eventId}/pauta`;
}

function mondayOf(date: Date) {
  const day = date.getUTCDay();
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  return result.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const requested = search.get("weekStart");
    const currentYear = new Date().getFullYear();
    const selectedYear = Math.min(currentYear, Math.max(2019, Number(search.get("year")) || currentYear));
    const expenseYear = Math.min(currentYear, Math.max(2023, Number(search.get("expenseYear")) || currentYear));
    const weekStart = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : mondayOf(new Date());
    const start = new Date(`${weekStart}T12:00:00Z`);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    const dataInicio = start.toISOString().slice(0,10);
    const dataFim = end.toISOString().slice(0,10);
    const propQs = new URLSearchParams({ idDeputadoAutor: String(DEPUTY_ID), dataInicio: `${selectedYear}-01-01`, dataFim: `${selectedYear}-12-31`, ordem: "DESC", ordenarPor: "id", itens: "100" });
    const years = Array.from({ length: currentYear - 2023 + 1 }, (_, i) => currentYear - i);

    const [propList, organList, yearlyLists, expenseRows] = await Promise.all([
      get(`/proposicoes?${propQs}`), get(`/deputados/${DEPUTY_ID}/orgaos`),
      Promise.all(years.map(year => get(`/proposicoes?${new URLSearchParams({ idDeputadoAutor:String(DEPUTY_ID), dataInicio:`${year}-01-01`, dataFim:`${year}-12-31`, itens:"100" })}`).catch(() => ({ dados: [] })))),
      getExpenses(expenseYear),
    ]);
    const yearCounts = years.map((year, i) => ({ year, count: ((yearlyLists[i] as ApiList).dados || []).length }));
    const activeOrgans = (((organList as ApiList).dados || []).filter(o => !o.dataFim));
    const eventQueries = [String(DEPUTY_ID), `orgao:${PLENARY_ORGAN_ID}`, ...activeOrgans.map(o => `orgao:${String(o.idOrgao || o.id)}`)];
    const eventResponses = await Promise.all(eventQueries.map(key => {
      const params = new URLSearchParams({ dataInicio, dataFim, ordem: "ASC", ordenarPor: "dataHoraInicio", itens: "100" });
      if (key.startsWith("orgao:")) params.set("idOrgao", key.slice(6)); else params.set("idDeputado", key);
      return get(`/eventos?${params}`).catch(() => ({ dados: [] }));
    }));

    const uniqueEvents = new Map<number, JsonRecord>();
    eventResponses.forEach(response => ((response as ApiList).dados || []).forEach(e => uniqueEvents.set(Number(e.id), e)));
    const rawEvents = [...uniqueEvents.values()].sort((a,b) => String(a.dataHoraInicio).localeCompare(String(b.dataHoraInicio)));
    const eventDetails = await Promise.all(rawEvents.map(e => Promise.all([
      get(`/eventos/${String(e.id)}`).catch(() => ({ dados: e })),
      get(`/eventos/${String(e.id)}/pauta`).catch(() => ({ dados: [] })),
    ])));

    const organIds = new Set(activeOrgans.map(o => Number(o.idOrgao || o.id)));
    const events = rawEvents.map((e, index) => {
      const detail = ((eventDetails[index][0] as ApiDetail).dados || e) as JsonRecord;
      const pautaRaw = ((eventDetails[index][1] as ApiList).dados || []);
      const local = (detail.localCamara || e.localCamara || {}) as JsonRecord;
      const orgaos = (detail.orgaos || e.orgaos || []) as JsonRecord[];
      const eventOrganIds = orgaos.map(o => Number(o.id || o.idOrgao));
      const isMemberMeeting = eventOrganIds.some(id => organIds.has(id));
      const isPlenary = eventOrganIds.includes(PLENARY_ORGAN_ID) || orgaos.some(o => /plen.rio/i.test(String(o.nome || o.apelido || o.sigla || "")));
      const pauta = pautaRaw.slice(0, 20).map((item, pos) => ({
        ordem: Number(item.ordem || item.numeroOrdem || pos + 1),
        titulo: String(item.titulo || item.regime || item.proposicao_?.siglaTipo || `Item ${pos + 1}`),
        ementa: String(item.ementa || item.ementaProposicao || item.descricao || "Item de pauta sem descrição complementar."),
        situacao: String(item.situacao || item.tipo || "Pautado"),
        url: propositionPage(item, Number(e.id)),
      }));
      return {
        id: Number(e.id), data: String(e.dataHoraInicio || dataInicio).slice(0,10),
        hora: chamberTime(e.dataHoraInicio) || "—",
        horaFim: chamberTime(e.dataHoraFim),
        titulo: String(detail.descricao || e.descricao || e.descricaoTipo || "Evento legislativo"),
        tipo: String(detail.descricaoTipo || e.descricaoTipo || "Evento"),
        local: String(local.nome || detail.localExterno || e.localExterno || "Câmara dos Deputados"),
        orgao: String(orgaos[0]?.sigla || e.siglaOrgao || "Câmara"),
        orgaoNome: String(orgaos[0]?.nome || orgaos[0]?.apelido || "Câmara dos Deputados"),
        situacao: String(detail.situacao || e.situacao || "Previsto"),
        url: `https://www.camara.leg.br/evento-legislativo/${String(e.id)}`,
        urlPauta: String(detail.urlDocumentoPauta || `${BASE}/eventos/${String(e.id)}/pauta`),
        requerido: isMemberMeeting || isPlenary || Boolean(eventResponses[0] && ((eventResponses[0] as ApiList).dados || []).some(d => Number(d.id) === Number(e.id))),
        plenary: isPlenary,
        pauta,
      };
    });

    const rawProps = ((propList as ApiList).dados || []).slice(0,24);
    const [details, progressResponses] = await Promise.all([
      Promise.all(rawProps.map(p => get(`/proposicoes/${String(p.id)}`).catch(() => ({ dados: {} })) as Promise<ApiDetail>)),
      Promise.all(rawProps.map(p => get(`/proposicoes/${String(p.id)}/tramitacoes?ordem=ASC&ordenarPor=dataHora`).catch(() => ({ dados: [] })) as Promise<ApiList>)),
    ]);
    const proposals = rawProps.map((p, i) => {
      const d = details[i]?.dados || {}; const st = (d.statusProposicao || {}) as JsonRecord;
      const rawProgress = progressResponses[i]?.dados || [];
      const flow = rawProgress.map((t, pos) => ({ id:`${String(p.id)}-${pos}`, data:shortDate(String(t.dataHora || "")), orgao:String(t.siglaOrgao || "Câmara"), descricao:String(t.descricaoTramitacao || t.descricaoSituacao || "Movimentação legislativa"), despacho:String(t.despacho || "").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim() }));
      const compactFlow = flow.filter((t, pos) => pos === 0 || pos === flow.length - 1 || t.orgao !== flow[pos - 1]?.orgao).slice(-8);
      return { id:Number(p.id), sigla:`${String(p.siglaTipo)} ${String(p.numero)}/${String(p.ano)}`, siglaTipo:String(p.siglaTipo || "Outro"), ano:Number(p.ano || selectedYear), ementa:String(p.ementa || d.ementa || "Sem ementa disponível."),
        status:String(st.descricaoSituacao || "Em tramitação"), orgao:String(st.siglaOrgao || st.descricaoTramitacao || "Câmara dos Deputados"),
        atualizado:shortDate(String(st.dataHora || d.dataApresentacao || "")), url:`https://www.camara.leg.br/propostas-legislativas/${String(p.id)}`,
        pdf:d.urlInteiroTeor ? String(d.urlInteiroTeor) : undefined, tema:String(d.keywords || "Legislação").split(",")[0], emTramitacao:!/(arquivad|transformad|retirad|devolvid|prejudicad)/i.test(String(st.descricaoSituacao || "")), priority:i<3?"alta":i<8?"media":"normal", flow:compactFlow, nextStep:String(st.descricaoTramitacao || st.descricaoSituacao || "Aguardar nova movimentação oficial") };
    });

    const committees = activeOrgans.map(o => ({ id:Number(o.idOrgao || o.id), sigla:String(o.siglaOrgao || o.sigla || "Órgão"), nome:String(o.nomeOrgao || o.nome || "Colegiado da Câmara"),
      papel:String(o.titulo || o.tipoOrgao || "Membro"), situacao:o.dataInicio ? `Desde ${shortDate(String(o.dataInicio))}` : "Participação atual", url:String(o.uriOrgao || `${BASE}/orgaos/${String(o.idOrgao || o.id)}`) }));

    const expenseTotal = expenseRows.reduce((sum, row) => sum + Number(row.valorLiquido || 0), 0);
    const expenseGlosa = expenseRows.reduce((sum, row) => sum + Number(row.valorGlosa || 0), 0);
    const monthTotals = new Map<number, number>();
    const typeTotals = new Map<string, { total:number; count:number }>();
    for (const row of expenseRows) {
      const month = Number(row.mes || 0);
      const value = Number(row.valorLiquido || 0);
      monthTotals.set(month, (monthTotals.get(month) || 0) + value);
      const type = String(row.tipoDespesa || "Outras despesas").replace(/\.$/, "");
      const current = typeTotals.get(type) || { total:0, count:0 };
      typeTotals.set(type, { total:current.total + value, count:current.count + 1 });
    }
    const spending = {
      year:expenseYear,
      total:expenseTotal,
      glosa:expenseGlosa,
      totalDocuments:expenseRows.length,
      byMonth:Array.from({length:12},(_,i)=>({ month:i+1, total:monthTotals.get(i+1) || 0 })),
      byType:[...typeTotals.entries()].map(([type,value])=>({type,...value})).sort((a,b)=>b.total-a.total),
      expenses:expenseRows.slice(0,60).map(row=>({
        id:String(row.codDocumento || `${row.ano}-${row.mes}-${row.numDocumento}`),
        month:Number(row.mes || 0),
        type:String(row.tipoDespesa || "Outras despesas").replace(/\.$/, ""),
        supplier:String(row.nomeFornecedor || "Fornecedor não informado"),
        date:String(row.dataDocumento || "").slice(0,10),
        value:Number(row.valorLiquido || 0),
        glosa:Number(row.valorGlosa || 0),
        document:String(row.tipoDocumento || row.numDocumento || "Documento fiscal"),
        url:String(row.urlDocumento || ""),
      })),
    };

    return Response.json({ proposals, committees, events, spending, yearCounts, selectedYear, weekStart, updatedAt:new Date().toISOString(), source:"live" });
  } catch (error) {
    console.warn("Falha ao consultar os Dados Abertos da Câmara", error);
    return Response.json({ error:"Dados oficiais temporariamente indisponíveis", updatedAt:new Date().toISOString() }, { status:503 });
  }
}
