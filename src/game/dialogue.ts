/** Gesprächsdaten (Luxemburgisch + Deutsch) aus data/dialog.json und Auswahl passender Sätze. */
export type Line = [lb: string, de: string];
export interface DialogData {
  names: { f: string[]; m: string[]; kid: string[] };
  pers: Record<string, { lb: string; de: string; voice: number }>;
  lines: Array<[cat: string, lb: string, de: string, filter: string]>;
  intro: Record<string, Line[]>; again: Array<[string, string, string]>; afterShock: Line[];
  choices: Record<'news' | 'lore' | 'tip' | 'you' | 'bye', Line>;
  news: Line[]; lore: Line[]; tips: Line[]; you: Record<string, Line[]>; friend: Line[]; convos: Line[][];
}
export interface Who { name: string; pers: string; role: string; }

export async function loadDialog(): Promise<DialogData> { return (await fetch('./data/dialog.json')).json(); }

const pickOf = <T>(a: T[], r = Math.random()) => a[Math.floor(r * a.length) % a.length];

/** Filter wie "t:moien,p:sonneg,r:kid": Tageszeit (t), Persönlichkeit (p), Rolle (r). Gleicher Typ = oder, verschiedene = und. */
function matches(filter: string, who: Who, hour: number) {
  if (!filter) return true;
  const tod = hour < 5 || hour >= 22 ? 'nuecht' : hour < 11 ? 'moien' : hour < 17 ? 'metteg' : 'owend';
  const by: Record<string, string[]> = {};
  for (const f of filter.split(',')) { const [k, v] = f.split(':'); (by[k] ??= []).push(v); }
  return (!by.t || by.t.includes(tod)) && (!by.p || by.p.includes(who.pers)) && (!by.r || by.r.includes(who.role));
}

export class Dialogue {
  constructor(public d: DialogData, public hero = 'Blëtz') {}
  fill(l: Line, who: Who): Line { return [l[0].replaceAll('{name}', who.name).replaceAll('{hero}', this.hero), l[1].replaceAll('{name}', who.name).replaceAll('{hero}', this.hero)]; }
  /** Satz einer Kategorie (greet, amb, shock, reshock, cute, wary, hero, bye) */
  line(cat: string, who: Who, hour: number): Line {
    const all = this.d.lines.filter(l => l[0] === cat);
    const fit = all.filter(l => matches(l[3], who, hour));
    const l = pickOf(fit.length ? fit : all); return this.fill([l[1], l[2]], who);
  }
  intro(who: Who): Line { return this.fill(pickOf(this.d.intro[who.pers] ?? Object.values(this.d.intro)[0]), who); }
  again(who: Who): Line {
    const fit = this.d.again.filter(a => matches(a[2], who, 12));
    const a = pickOf(fit.length ? fit : this.d.again); return this.fill([a[0], a[1]], who);
  }
  answer(topic: 'news' | 'lore' | 'tip' | 'you', who: Who): Line {
    const pool = topic === 'news' ? this.d.news : topic === 'lore' ? this.d.lore : topic === 'tip' ? this.d.tips : (this.d.you[who.role] ?? this.d.you.casual);
    return this.fill(pickOf(pool), who);
  }
  afterShock(who: Who): Line { return this.fill(pickOf(this.d.afterShock), who); }
  friend(who: Who): Line { return this.fill(pickOf(this.d.friend), who); }
  convo(): Line[] { return pickOf(this.d.convos); }
  name(female: boolean, r: number) { return pickOf(female ? this.d.names.f : this.d.names.m, r); }
  persOf(r: number) { return pickOf(Object.keys(this.d.pers), r); }
  roleOf(r: number) { return pickOf(Object.keys(this.d.you).filter(k => k !== 'kid'), r); }
}
