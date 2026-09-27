export function dateGap(lastDate,matchDate){
  if(!lastDate||!matchDate)return "—";
  const a=new Date(lastDate+"T12:00:00Z"),b=new Date(matchDate+"T12:00:00Z");
  const d=Math.round((b-a)/86400000)-1;
  return d>=0?String(d):"—";
}
export function daysBetween(a,b){
  if(!a||!b)return "";
  const da=new Date(a+"T12:00:00Z"), db=new Date(b+"T12:00:00Z");
  const d=Math.round((db-da)/86400000)-1;
  return d>=0?d:"";
}

function dateDiagnostic(code,message){
  const error=new Error(message);error.code=code;return error;
}
export function dateInTimeZone(value,timeZone){
  const raw=String(value||"").trim();
  if(!raw)return "";
  // A provider's date-only value is already a calendar date, not UTC midnight.
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)||!Number.isFinite(Date.parse(raw)))
    throw dateDiagnostic("FIXTURE_DATE_INVALID","Kickoff must contain an explicit UTC offset: "+raw);
  if(timeZone){
    try{
      const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"})
        .formatToParts(new Date(raw));
      const part=type=>parts.find(p=>p.type===type).value;
      return `${part("year")}-${part("month")}-${part("day")}`;
    }catch(_){throw dateDiagnostic("FIXTURE_TIMEZONE_INVALID","Invalid kickoff time zone: "+timeZone);}
  }
  // A non-Z offset timestamp explicitly carries the source's local date.
  // Z alone only describes UTC transport, not the match's real local zone.
  if(/[+-]\d{2}:?\d{2}$/.test(raw))return raw.slice(0,10);
  throw dateDiagnostic("FIXTURE_TIMEZONE_UNRESOLVED","No verified kickoff/competition time zone for "+raw);
}
export function fixtureTimeZone(f){
  return f?.status?.timeZone||f?.status?.timezone||f?.timeZone||f?.timezone||
    f?.venue?.timeZone||f?.venue?.timezone||f?.tournament?.timeZone||f?.tournament?.timezone||"";
}
export function knownCompetitionTimeZones(fixtures){
  const zones=new Map();
  for(const f of fixtures){
    const id=Number(f?.tournament?.leagueId||0);
    // Venue/match-specific zones must not be generalized across an entire league.
    const zone=f?.tournament?.timeZone||f?.tournament?.timezone;
    if(!id||!zone)continue;
    if(!zones.has(id))zones.set(id,new Set());
    zones.get(id).add(zone);
  }
  return Object.fromEntries([...zones].filter(([,values])=>values.size===1).map(([id,values])=>[id,[...values][0]]));
}
export function fixtureDate(f,competitionTimeZones={}){
  return dateInTimeZone(f?.status?.utcTime,
    fixtureTimeZone(f)||competitionTimeZones[Number(f?.tournament?.leagueId||0)]);
}
